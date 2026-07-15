package engine

import (
	"context"
	"errors"
	"time"
)

// Error classification. A NodeExecutor wraps its errors so the scheduler knows
// whether to retry:
//
//   - Transient: a flaky failure (timeout, rate limit) — retry as-is.
//   - ContractViolation: output failed its contract — retry, and (M1.4) the
//     executor appends the validation feedback to the next attempt's context.
//   - Fatal (the default for any unwrapped error): do not retry; fail the node.
type transientError struct{ err error }

func (e transientError) Error() string { return e.err.Error() }
func (e transientError) Unwrap() error { return e.err }

type contractViolationError struct {
	err      error
	Feedback string
}

func (e contractViolationError) Error() string { return e.err.Error() }
func (e contractViolationError) Unwrap() error { return e.err }

type fatalError struct{ err error }

func (e fatalError) Error() string { return e.err.Error() }
func (e fatalError) Unwrap() error { return e.err }

// Transient marks err as a retryable transient failure.
func Transient(err error) error { return transientError{err} }

// ContractViolation marks err as a contract violation, carrying feedback to
// surface on the retry.
func ContractViolation(err error, feedback string) error {
	return contractViolationError{err: err, Feedback: feedback}
}

// Fatal marks err as non-retryable.
func Fatal(err error) error { return fatalError{err} }

type errorClass int

const (
	classFatal errorClass = iota
	classTransient
	classContractViolation
)

// classify decides how an executor error should be handled. Anything not
// explicitly marked transient or contract-violation is treated as fatal.
func classify(err error) errorClass {
	var ce contractViolationError
	if errors.As(err, &ce) {
		return classContractViolation
	}
	var te transientError
	if errors.As(err, &te) {
		return classTransient
	}
	return classFatal
}

// backoffFunc returns the delay before retry attempt n (1-based). nil means no
// delay.
type backoffFunc func(attempt int) time.Duration

// exponentialBackoff returns base * 2^(attempt-1), capped at max. A zero base
// yields no delay (used in tests).
func exponentialBackoff(base, max time.Duration) backoffFunc {
	return func(attempt int) time.Duration {
		if base <= 0 {
			return 0
		}
		d := base
		for i := 1; i < attempt; i++ {
			d *= 2
			if d >= max {
				return max
			}
		}
		return d
	}
}

// withRetry runs fn until it succeeds, hits a fatal error, or exhausts
// maxRetries. onRetry is called before each retry with the upcoming attempt
// number and the reason. Backoff sleeps respect ctx cancellation.
func withRetry(ctx context.Context, maxRetries int, backoff backoffFunc, fn func(attempt int) error, onRetry func(attempt int, reason string)) error {
	for attempt := 0; ; attempt++ {
		err := fn(attempt)
		if err == nil {
			return nil
		}
		if classify(err) == classFatal || attempt >= maxRetries {
			return err
		}
		if onRetry != nil {
			onRetry(attempt+1, err.Error())
		}
		if backoff != nil {
			if d := backoff(attempt + 1); d > 0 {
				if !sleep(ctx, d) {
					return ctx.Err()
				}
			}
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
}

// sleep waits for d or until ctx is done; it returns false if ctx ended first.
func sleep(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-ctx.Done():
		return false
	}
}
