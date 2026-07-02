package sms

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"go.uber.org/zap"

	"github.com/kombuwaedu/api/internal/config"
)

// Client sends OTP SMS messages. In development it logs to console; in
// production it calls the Dialog/Mobitel SMS API, matching auth.service.js:14-28.
type Client struct {
	cfg  *config.Config
	log  *zap.Logger
	http *http.Client
}

// New creates an SMS client.
func New(cfg *config.Config, log *zap.Logger) *Client {
	return &Client{
		cfg:  cfg,
		log:  log,
		http: &http.Client{Timeout: 10 * time.Second},
	}
}

// Send delivers the OTP code to mobile.
func (c *Client) Send(ctx context.Context, mobile, code string) error {
	if !c.cfg.IsProd() {
		c.log.Info("[SMS DEV]", zap.String("to", mobile), zap.String("otp", code))
		return nil
	}

	payload := map[string]string{
		"apiKey":  c.cfg.SMSApiKey,
		"sender":  c.cfg.SMSSenderID,
		"to":      mobile,
		"message": fmt.Sprintf("ඔබේ Kombuwaedu OTP: %s. %d min valid. Share with nobody.", code, c.cfg.OTPExpireMinutes),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal sms payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.SMSApiURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create sms request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("send sms: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("sms api returned %d", resp.StatusCode)
	}
	return nil
}
