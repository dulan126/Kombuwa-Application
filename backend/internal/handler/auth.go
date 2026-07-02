package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	"github.com/kombuwaedu/api/internal/httputil"
	"github.com/kombuwaedu/api/internal/middleware"
	"github.com/kombuwaedu/api/internal/repository"
	"github.com/kombuwaedu/api/internal/service"
)

// AuthHandler exposes all auth HTTP endpoints.
type AuthHandler struct {
	svc        *service.AuthService
	authMW     *middleware.Auth
	log        *zap.Logger
	otpLimiter func(http.Handler) http.Handler
	loginLimit func(http.Handler) http.Handler
}

// NewAuthHandler creates an AuthHandler.
func NewAuthHandler(
	svc *service.AuthService,
	authMW *middleware.Auth,
	log *zap.Logger,
	otpLimiter func(http.Handler) http.Handler,
	loginLimiter func(http.Handler) http.Handler,
) *AuthHandler {
	return &AuthHandler{
		svc:        svc,
		authMW:     authMW,
		log:        log,
		otpLimiter: otpLimiter,
		loginLimit: loginLimiter,
	}
}

// Routes returns a chi.Router with all auth sub-routes mounted.
func (h *AuthHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.With(h.otpLimiter).Post("/register", h.register)
	r.With(h.otpLimiter).Post("/verify-otp", h.verifyOTP)
	r.With(h.loginLimit).Post("/login", h.login)
	r.With(h.authMW.Authenticate).Post("/logout", h.logout)
	r.With(h.otpLimiter).Post("/resend-otp", h.resendOTP)
	r.With(h.otpLimiter).Post("/forgot-password", h.forgotPassword)
	r.With(h.otpLimiter).Post("/reset-password", h.resetPassword)
	r.Post("/refresh", h.refresh)
	r.With(h.authMW.Authenticate).Get("/me", h.getProfile)
	r.With(h.authMW.Authenticate).Patch("/me", h.updateProfile)

	return r
}

// POST /auth/register
func (h *AuthHandler) register(w http.ResponseWriter, r *http.Request) {
	var in service.RegisterInput
	if err := httputil.Decode(r, &in); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := h.svc.Register(r.Context(), in); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusCreated, map[string]string{"message": "OTP sent to your mobile number"})
}

// POST /auth/verify-otp
func (h *AuthHandler) verifyOTP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Mobile  string `json:"mobile"`
		Code    string `json:"code"`
		Purpose string `json:"purpose"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.Purpose == "" {
		body.Purpose = "register"
	}
	tokens, err := h.svc.VerifyOTP(r.Context(), body.Mobile, body.Code, body.Purpose)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, tokens)
}

// POST /auth/login
func (h *AuthHandler) login(w http.ResponseWriter, r *http.Request) {
	var in service.LoginInput
	if err := httputil.Decode(r, &in); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	tokens, err := h.svc.Login(r.Context(), in)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, tokens)
}

// POST /auth/logout
func (h *AuthHandler) logout(w http.ResponseWriter, r *http.Request) {
	token := middleware.TokenFromCtx(r.Context())
	if err := h.svc.Logout(r.Context(), token); err != nil {
		h.log.Error("logout blocklist", zap.Error(err))
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "Logged out successfully"})
}

// POST /auth/resend-otp
func (h *AuthHandler) resendOTP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Mobile  string `json:"mobile"`
		Purpose string `json:"purpose"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.Purpose == "" {
		body.Purpose = "register"
	}
	if err := h.svc.ResendOTP(r.Context(), body.Mobile, body.Purpose); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "OTP resent successfully"})
}

// POST /auth/forgot-password
func (h *AuthHandler) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Mobile string `json:"mobile"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	// Always return 200 regardless of whether the mobile exists (enumeration protection).
	_ = h.svc.ForgotPassword(r.Context(), body.Mobile)
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "If your mobile is registered, you will receive an OTP"})
}

// POST /auth/reset-password
func (h *AuthHandler) resetPassword(w http.ResponseWriter, r *http.Request) {
	var in service.ResetPasswordInput
	if err := httputil.Decode(r, &in); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := h.svc.ResetPassword(r.Context(), in); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "Password reset successfully"})
}

// POST /auth/refresh
func (h *AuthHandler) refresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := httputil.Decode(r, &body); err != nil || body.RefreshToken == "" {
		httputil.Error(w, http.StatusBadRequest, "refreshToken is required")
		return
	}
	tokens, err := h.svc.Refresh(r.Context(), body.RefreshToken)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, tokens)
}

// GET /auth/me
func (h *AuthHandler) getProfile(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	if user == nil {
		httputil.Error(w, http.StatusUnauthorized, "Authentication required")
		return
	}
	profile, err := h.svc.GetProfile(r.Context(), user.ID)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, profile)
}

// PATCH /auth/me
func (h *AuthHandler) updateProfile(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	if user == nil {
		httputil.Error(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var body struct {
		Name     *string `json:"name"`
		School   *string `json:"school"`
		District *string `json:"district"`
		ExamYear *int    `json:"examYear"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	updated, err := h.svc.UpdateProfile(r.Context(), repository.UpdateProfileParams{
		UserID:   user.ID,
		Name:     body.Name,
		School:   body.School,
		District: body.District,
		ExamYear: body.ExamYear,
	})
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, updated)
}

