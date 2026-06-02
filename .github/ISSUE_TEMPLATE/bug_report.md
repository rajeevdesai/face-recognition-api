---
name: Bug report
about: Something behaves incorrectly
title: ''
labels: bug
assignees: ''
---

**What happened**
A clear description of the bug.

**Expected**
What you expected instead.

**Reproduction**
Steps, plus a minimal code snippet if possible:

```typescript
// loadModels(...) / compareFaces(...) call
```

**The result object**
Paste the full `CompareResult` (`match`, `confidence`, `flags`, `details`). Redact any face images — do not attach biometric data.

```json

```

**Environment**
- Library version:
- Browser + OS:
- `onnxruntime-web` / `@mediapipe/tasks-vision` versions:
- Models: downloaded via `npx @rajeevdesai/face-verification-api download`? self-hosted? custom recognition model?

**Notes**
Have you ruled out the documented [Open Risks](../../README.md#open-risks) (uncalibrated thresholds, print-only liveness)?
