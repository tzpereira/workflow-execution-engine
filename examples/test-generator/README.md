# test-generator

A read-only three-step workflow that fetches one public source file, builds a
bounded test plan, and generates a complete test file. The final artifact uses
the UI's formatted code viewer; nothing is written to a checkout.

Use a raw GitHub URL as `sourceUrl`, for example:

```text
https://raw.githubusercontent.com/OWNER/REPO/REF/path/to/file.go
```

Requires `OPENAI_API_KEY`. It makes two bounded `gpt-4o-mini` calls and allows
one transient retry per node.
