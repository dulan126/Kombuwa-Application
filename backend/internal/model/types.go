package model

import (
	"time"

	"github.com/google/uuid"
)

// ── Permission types ──────────────────────────────────────────────────────────

// Permission is a single action code stored in the permissions table.
type Permission struct {
	Code        string `json:"code"`
	Description string `json:"description"`
}

// PoolQuestion is a question in the shared pool (admin-facing; includes correct_option).
type PoolQuestion struct {
	ID            int32   `json:"id"`
	Slug          string  `json:"slug"`
	SubjectID     *string `json:"subject_id,omitempty"`
	TopicID       *int32  `json:"topic_id,omitempty"`
	QuestionText  string  `json:"question_text"`
	OptionA       string  `json:"option_a"`
	OptionB       string  `json:"option_b"`
	OptionC       string  `json:"option_c"`
	OptionD       string  `json:"option_d"`
	OptionE       string  `json:"option_e"`
	CorrectOption string  `json:"correct_option"`
	Explanation   *string `json:"explanation,omitempty"`
	ImageURL      *string `json:"image_url,omitempty"`
	// IsPp marks a question authored from the past-paper path (true) vs. the
	// question pool (false). Reflects origin, not which papers reference it.
	IsPp bool `json:"is_pp"`
	// Images maps a slot ("question"/"a"/"b"/"c"/"d"/"e") to a gated image URL,
	// populated by the service layer. Sparse — only present slots appear.
	Images    map[string]string `json:"images,omitempty"`
	CreatedBy *uuid.UUID        `json:"created_by,omitempty"`
	CreatedAt time.Time         `json:"created_at"`
}

// PaperQuestion is a pool question with its position in a specific paper.
type PaperQuestion struct {
	PoolQuestion
	SortOrder int16 `json:"sort_order"`
}

// ── Enum types ────────────────────────────────────────────────────────────────

type UserRole string

const (
	RoleStudent UserRole = "student"
	RoleTeacher UserRole = "teacher"
	RoleAdmin   UserRole = "admin"
	RoleEditor  UserRole = "editor"
)

type Stream string

const (
	StreamPhy Stream = "phy"
	StreamBio Stream = "bio"
	StreamCom Stream = "com"
	StreamArt Stream = "art"
	StreamTec Stream = "tec"
)

type Grade string

const (
	Grade12 Grade = "12"
	Grade13 Grade = "13"
)

type PaperType string

const (
	PaperDaily     PaperType = "daily"
	PaperSRP       PaperType = "srp"
	PaperPastPaper PaperType = "pastpaper"
)

type ThreadStatus string

const (
	ThreadPending  ThreadStatus = "pending"
	ThreadResolved ThreadStatus = "resolved"
)

// ── Domain models ─────────────────────────────────────────────────────────────

type User struct {
	ID         uuid.UUID  `json:"id"`
	Mobile     string     `json:"mobile"`
	Name       string     `json:"name"`
	Role       UserRole   `json:"role"`
	Stream     *Stream    `json:"stream,omitempty"`
	Grade      *Grade     `json:"grade,omitempty"`
	District   *string    `json:"district,omitempty"`
	School     *string    `json:"school,omitempty"`
	ExamYear   *int16     `json:"exam_year,omitempty"`
	IsVerified bool       `json:"is_verified"`
	IsActive   bool       `json:"is_active"`
	LastLogin  *time.Time `json:"last_login,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

type Paper struct {
	ID             uuid.UUID  `json:"id"`
	Type           PaperType  `json:"type"`
	SubjectID      string     `json:"subject_id"`
	Grade          Grade      `json:"grade"`
	Title          string     `json:"title"`
	QuestionCount  int16      `json:"question_count"`
	TimeSeconds    int32      `json:"time_seconds"`
	AvailableFrom  time.Time  `json:"available_from"`
	AvailableUntil *time.Time `json:"available_until,omitempty"`
	MSAvailable    bool       `json:"ms_available"`
	IsPublished    bool       `json:"is_published"`
	CreatedAt      time.Time  `json:"created_at"`
	// IsCompleted and Score are joined from attempts for the requesting user.
	IsCompleted *bool  `json:"is_completed,omitempty"`
	Score       *int16 `json:"score,omitempty"`
}

// Question holds a single MCQ question as delivered to a student during an exam.
// SortOrder is populated from paper_questions.sort_order for the paper being taken.
// CorrectOption is never serialised to JSON — it is stripped before sending to students.
type Question struct {
	ID            int32   `json:"id"`
	SortOrder     int16   `json:"sort_order"`
	QuestionText  string  `json:"question_text"`
	OptionA       string  `json:"option_a"`
	OptionB       string  `json:"option_b"`
	OptionC       string  `json:"option_c"`
	OptionD       string  `json:"option_d"`
	OptionE       string  `json:"option_e"`
	CorrectOption string  `json:"-"`
	Explanation   *string `json:"explanation,omitempty"`
	ImageURL      *string `json:"image_url,omitempty"`
	// Images maps a slot ("question"/"a"/"b"/"c"/"d"/"e") to a gated image URL.
	// Populated by the service; carries no image bytes. Sparse.
	Images map[string]string `json:"images,omitempty"`
}

// QuestionWithAnswer is used in the marking scheme response (correct_option exposed).
type QuestionWithAnswer struct {
	Question
	CorrectOption string  `json:"correct_option"`
	Explanation   *string `json:"explanation,omitempty"`
}

type Attempt struct {
	ID             uuid.UUID         `json:"id"`
	UserID         uuid.UUID         `json:"user_id"`
	PaperID        uuid.UUID         `json:"paper_id"`
	Score          int16             `json:"score"`
	TotalQuestions int16             `json:"total_questions"`
	Answers        map[string]string `json:"answers"`
	StartedAt      time.Time         `json:"started_at"`
	SubmittedAt    *time.Time        `json:"submitted_at,omitempty"`
	TimeTakenSecs  *int32            `json:"time_taken_secs,omitempty"`
	IsCompleted    bool              `json:"is_completed"`
}

type Ranking struct {
	ID            uuid.UUID `json:"id"`
	PaperID       uuid.UUID `json:"paper_id"`
	UserID        uuid.UUID `json:"user_id"`
	Name          string    `json:"name"`
	District      *string   `json:"district,omitempty"`
	Score         int16     `json:"score"`
	TimeTakenSecs int32     `json:"time_taken_secs"`
	NationalRank  *int32    `json:"national_rank,omitempty"`
	DistrictRank  *int32    `json:"district_rank,omitempty"`
	ComputedAt    time.Time `json:"computed_at"`
}

type Subject struct {
	ID        string  `json:"id"`
	NameSi    string  `json:"name_si"`
	Stream    Stream  `json:"stream"`
	SortOrder int16   `json:"sort_order"`
	Topics    []Topic `json:"topics,omitempty"`
}

type Topic struct {
	ID        int32  `json:"id"`
	SubjectID string `json:"subject_id"`
	NameSi    string `json:"name_si"`
	SortOrder int16  `json:"sort_order"`
}

type ForumThread struct {
	ID         uuid.UUID    `json:"id"`
	UserID     uuid.UUID    `json:"user_id"`
	SubjectID  string       `json:"subject_id"`
	Title      string       `json:"title"`
	Body       string       `json:"body"`
	ImageURLs  []string     `json:"image_urls"`
	Status     ThreadStatus `json:"status"`
	ViewCount  int32        `json:"view_count"`
	ReplyCount int32        `json:"reply_count"`
	CreatedAt  time.Time    `json:"created_at"`
	UpdatedAt  time.Time    `json:"updated_at"`
	// Joined fields
	AuthorName string `json:"author_name,omitempty"`
}

type ForumReply struct {
	ID         uuid.UUID  `json:"id"`
	ThreadID   uuid.UUID  `json:"thread_id"`
	UserID     uuid.UUID  `json:"user_id"`
	Body       string     `json:"body"`
	IsVerified bool       `json:"is_verified"`
	VerifiedBy *uuid.UUID `json:"verified_by,omitempty"`
	VerifiedAt *time.Time `json:"verified_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	// Joined fields
	AuthorName string `json:"author_name,omitempty"`
	AuthorRole string `json:"author_role,omitempty"`
}

// OTP is an internal-only type; never serialised to JSON.
type OTP struct {
	ID        uuid.UUID
	Mobile    string
	Code      string
	Purpose   string
	Attempts  int16
	Verified  bool
	ExpiresAt time.Time
	CreatedAt time.Time
}
