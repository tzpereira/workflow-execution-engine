package runner

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"
)

// NewExecutionID mints a fresh, sortable execution id: the workflow id, a
// UTC timestamp (second precision, lexically sortable), and a short random
// suffix to break ties within the same second. Example:
// "hello-20260717T153045-1a2b3c".
func NewExecutionID(workflowID string) string {
	var b [3]byte
	_, _ = rand.Read(b[:])
	return fmt.Sprintf("%s-%s-%s", workflowID, time.Now().UTC().Format("20060102T150405"), hex.EncodeToString(b[:]))
}
