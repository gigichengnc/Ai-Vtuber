# Put your Live2D model here

This folder is ignored by git, so your model never gets uploaded to GitHub.

Copy your whole model folder (the one VTube Studio uses) into `models/`, for example:

```
models/
  zhaomu/
    朝暮_v6.model3.json
    朝暮_v6.moc3
    朝暮_v6.physics3.json
    朝暮_v6.cdi3.json
    朝暮_v6.4096/        <- texture_00.png ... texture_04.png
    expressions/         <- *.exp3.json
    motions/             <- *.motion3.json
```

Then make sure `model` in `config/avatar.json` points at the `.model3.json` file
(`/models/zhaomu/朝暮_v6.model3.json` for the layout above).

## Kokoro voice files (optional)

If you use the offline Kokoro voice (see the main README), put
`kokoro-v1.0.int8.onnx` and `voices-v1.0.bin` in `models/kokoro/`.
