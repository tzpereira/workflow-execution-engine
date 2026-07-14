package canonical_test

import (
	"testing"

	"github.com/tzpereira/workflow-execution-engine/core/canonical"
)

func TestMarshalSortsKeysDeterministically(t *testing.T) {
	// Two maps with the same content but different literal orders must produce
	// identical canonical bytes.
	a := map[string]any{"b": 1, "a": 2, "c": map[string]any{"z": 1, "y": 2}}
	b := map[string]any{"c": map[string]any{"y": 2, "z": 1}, "a": 2, "b": 1}

	ab, err := canonical.Marshal(a)
	if err != nil {
		t.Fatal(err)
	}
	bb, err := canonical.Marshal(b)
	if err != nil {
		t.Fatal(err)
	}
	if string(ab) != string(bb) {
		t.Fatalf("canonical output differs by key order:\n a: %s\n b: %s", ab, bb)
	}

	const want = `{"a":2,"b":1,"c":{"y":2,"z":1}}`
	if string(ab) != want {
		t.Errorf("unexpected canonical form\n want %s\n  got %s", want, ab)
	}
}

func TestMarshalPreservesNumberPrecision(t *testing.T) {
	got, err := canonical.Marshal(map[string]any{"cost": 0.01, "tokens": 200000})
	if err != nil {
		t.Fatal(err)
	}
	const want = `{"cost":0.01,"tokens":200000}`
	if string(got) != want {
		t.Errorf("want %s, got %s", want, got)
	}
}

func TestMarshalNoHTMLEscaping(t *testing.T) {
	got, err := canonical.Marshal(map[string]any{"expr": "a < b && c > d"})
	if err != nil {
		t.Fatal(err)
	}
	const want = `{"expr":"a < b && c > d"}`
	if string(got) != want {
		t.Errorf("want %s, got %s", want, got)
	}
}

func TestHashStableAndOrderIndependent(t *testing.T) {
	a := map[string]any{"x": 1, "y": 2}
	b := map[string]any{"y": 2, "x": 1}

	ha, err := canonical.Hash(a)
	if err != nil {
		t.Fatal(err)
	}
	hb, err := canonical.Hash(b)
	if err != nil {
		t.Fatal(err)
	}
	if ha != hb {
		t.Errorf("hash depends on key order: %s != %s", ha, hb)
	}
	if len(ha) != 64 {
		t.Errorf("expected 64 hex chars (sha256), got %d", len(ha))
	}
}
