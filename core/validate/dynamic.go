package validate

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"golang.org/x/text/language"
	"golang.org/x/text/message"
)

// adhocSchemaID is the synthetic $id under which an in-memory schema (a
// Contract's outputSchema) is registered for compilation. It never leaves this
// package and collides with nothing in schemas/.
const adhocSchemaID = "https://wee.dev/schemas/adhoc/output.schema.json"

// CompiledSchema is a compiled, in-memory JSON Schema (draft 2020-12) — a
// Contract's outputSchema — ready to validate Worker output repeatedly. It is
// the runtime counterpart to the file-backed schemas the Validator compiles.
type CompiledSchema struct {
	sch     *jsonschema.Schema
	printer *message.Printer
}

// CompileSchema compiles an in-memory JSON Schema document for repeated
// validation of Worker output against a Contract (REQ-CONTRACT-01). The document
// is the value of a Contract's outputSchema.
func CompileSchema(schema map[string]any) (*CompiledSchema, error) {
	raw, err := json.Marshal(schema)
	if err != nil {
		return nil, fmt.Errorf("validate: encoding output schema: %w", err)
	}
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("validate: parsing output schema: %w", err)
	}
	c := jsonschema.NewCompiler()
	if err := c.AddResource(adhocSchemaID, doc); err != nil {
		return nil, fmt.Errorf("validate: adding output schema: %w", err)
	}
	sch, err := c.Compile(adhocSchemaID)
	if err != nil {
		return nil, fmt.Errorf("validate: compiling output schema: %w", err)
	}
	return &CompiledSchema{sch: sch, printer: message.NewPrinter(language.English)}, nil
}

// ValidateBytes checks a JSON document against the compiled schema. It returns
// nil on conformance, or a *SchemaError listing each leaf violation — the text
// used verbatim as the delta feedback on a contract-violation retry (PRIN-05):
// only the errors, never a re-inflated copy of the context. Output that is not
// valid JSON is itself a violation (the enforcement pipeline's first step).
func (cs *CompiledSchema) ValidateBytes(data []byte) error {
	inst, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		return &SchemaError{
			Kind:     "output",
			Problems: []Problem{{Message: fmt.Sprintf("output is not valid JSON: %v", err)}},
		}
	}
	if err := cs.sch.Validate(inst); err != nil {
		var ve *jsonschema.ValidationError
		if errors.As(err, &ve) {
			return &SchemaError{Kind: "output", Problems: collectProblems(ve, cs.printer, nil)}
		}
		return err
	}
	return nil
}

// collectProblems flattens a ValidationError tree into leaf Problems. It is the
// free-function core shared by Validator.collect and CompiledSchema.
func collectProblems(ve *jsonschema.ValidationError, printer *message.Printer, src LineResolver) []Problem {
	var out []Problem
	var walk func(e *jsonschema.ValidationError)
	walk = func(e *jsonschema.ValidationError) {
		if len(e.Causes) == 0 {
			out = append(out, resolveLine(src, Problem{
				Pointer: pointerOf(e.InstanceLocation),
				Message: e.ErrorKind.LocalizedString(printer),
			}))
			return
		}
		for _, c := range e.Causes {
			walk(c)
		}
	}
	walk(ve)
	if len(out) == 0 {
		out = append(out, resolveLine(src, Problem{
			Pointer: pointerOf(ve.InstanceLocation),
			Message: ve.ErrorKind.LocalizedString(printer),
		}))
	}
	return out
}
