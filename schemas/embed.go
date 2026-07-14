// Package schemas embeds the canonical JSON Schemas (draft 2020-12) that are
// the source of truth for every domain object. The Go structs in core/domain
// mirror these files; core/validate compiles them and validates against them.
package schemas

import "embed"

// FS holds every *.schema.json file in this directory.
//
//go:embed *.schema.json
var FS embed.FS
