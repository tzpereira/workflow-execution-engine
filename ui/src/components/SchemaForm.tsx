import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { RJSFSchema, UiSchema } from '@rjsf/utils'

import type { JSONSchema } from '../schemas'

// SchemaForm renders an @rjsf form for one of the engine's JSON Schemas. The
// submit button is hidden — edits flow live through onChange, so the canvas and
// the form stay in lockstep. It is the single place the UI turns a schema into
// inputs; every config panel goes through here.
const hideSubmit: UiSchema = { 'ui:submitButtonOptions': { norender: true } }

export function SchemaForm<T>({
  schema,
  formData,
  onChange,
  uiSchema,
}: {
  schema: JSONSchema
  formData: T
  onChange: (data: T) => void
  uiSchema?: UiSchema
}) {
  return (
    <Form
      schema={schema as RJSFSchema}
      validator={validator}
      formData={formData}
      onChange={(e) => onChange(e.formData as T)}
      uiSchema={{ ...hideSubmit, ...uiSchema }}
      liveValidate={false}
    />
  )
}
