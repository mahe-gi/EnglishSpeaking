# AI & Sarvam Rules
<!-- description: Apply when working on Speech-to-Text transcription, Sarvam API integration, prompt engineering, LLM evaluation, and scoring. -->

## Speech-to-Text (STT)
- Provider: Sarvam Saaras (`saaras:v4`, mode: `verbatim` to capture filler words like *umm*, *uh*, *actually*, *basically*, *like*).
- Reject recordings < 1 second. Limit maximum recording duration to 30 seconds for MVP.
- Delete temporary audio files immediately after transcription (default 0-day retention).

## LLM & Prompt Security
- Treat user transcript as **untrusted data**. Users may attempt prompt injection.
- Prompt structure must strictly separate: `ROLE`, `OBJECTIVE`, `CONTEXT`, `INPUT` (user transcript), `CONSTRAINTS`, `RUBRIC`, `OUTPUT SCHEMA`, and `FAILURE BEHAVIOR`.
- Validate all structured LLM output with Zod schemas.
- If JSON parsing/validation fails: retry once; if it fails again, fallback to safe deterministic feedback.

## Feedback Truth Rule
- Never claim the user said "X" unless "X" actually appears in the transcript.
- Label model-generated alternatives as "Better version".
