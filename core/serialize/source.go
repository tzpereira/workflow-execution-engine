package serialize

import (
	"os"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// Source indexes a parsed YAML document so validation can map a value's
// location back to a source line. It satisfies the line-resolver interface the
// validators accept, letting schema and graph errors cite file:line.
type Source struct {
	Path string
	doc  *yaml.Node
}

// LoadSource parses path's YAML into a position-aware tree. It does not decode
// into a domain struct; pair it with LoadWorkflow when both are needed.
func LoadSource(path string) (*Source, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var doc yaml.Node
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	return &Source{Path: path, doc: &doc}, nil
}

// File returns the source path.
func (s *Source) File() string {
	if s == nil {
		return ""
	}
	return s.Path
}

// Line resolves a JSON pointer (e.g. "/edges/2/to") to a 1-based line number.
// ok is false if the document is absent or the pointer does not resolve.
func (s *Source) Line(pointer string) (line int, ok bool) {
	if s == nil || s.doc == nil {
		return 0, false
	}
	n := s.doc
	if n.Kind == yaml.DocumentNode && len(n.Content) > 0 {
		n = n.Content[0]
	}
	if pointer == "" || pointer == "/" {
		return n.Line, true
	}
	for _, seg := range strings.Split(strings.TrimPrefix(pointer, "/"), "/") {
		seg = decodePointerSegment(seg)
		switch n.Kind {
		case yaml.MappingNode:
			next, found := childByKey(n, seg)
			if !found {
				return 0, false
			}
			n = next
		case yaml.SequenceNode:
			idx, err := strconv.Atoi(seg)
			if err != nil || idx < 0 || idx >= len(n.Content) {
				return 0, false
			}
			n = n.Content[idx]
		default:
			return 0, false
		}
	}
	return n.Line, true
}

// childByKey returns the value node for key in a mapping node. For a mapping,
// Content alternates [key, value, key, value, ...].
func childByKey(m *yaml.Node, key string) (*yaml.Node, bool) {
	for i := 0; i+1 < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			return m.Content[i+1], true
		}
	}
	return nil, false
}

// decodePointerSegment unescapes the two RFC 6901 JSON-pointer escapes.
func decodePointerSegment(s string) string {
	s = strings.ReplaceAll(s, "~1", "/")
	s = strings.ReplaceAll(s, "~0", "~")
	return s
}
