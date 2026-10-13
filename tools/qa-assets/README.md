# Sites editor synthetic photo inputs

These three images were created with the built-in image-generation tool on 14 October 2026, then encoded as quality-82 JPEGs for a local component fixture. They depict no actual SuperMega customer, studio, or premises. `build_sites_editor_browser_fixture.mjs` uses them only to check the real editor's image layout and in-memory save/reopen. They are not shipped in the application, offered as customer templates, or approved for the public product gallery.

| File | Prompt subject | SHA-256 of committed JPEG |
| --- | --- | --- |
| `sites-studio-sample.jpg` | Premium editorial photo of a creative studio worktable with blank paper, unbranded print swatches, pencil and plant; natural morning light; horizontal 4:3 and 8:5-safe crop; no people, text, logos, watermark or UI. | `3d6f0be7d5c4bbcdcf923fd423206b653c61058c46264aa1b7fba456efb005da` |
| `sites-studio-materials.jpg` | Editorial photo of an independent design-and-print studio materials shelf with blank notebooks, paper samples and a leafy vase; realistic wood and paper; natural light; no people, text, logos, watermark or UI. | `ddc0a8ed18dd7a04e400751baf639eb1818a052a154789156ae1b40173c6b7b6` |
| `sites-studio-entrance.jpg` | Editorial photo of a welcoming independent studio entrance with bench, plants and warm interior through glass; realistic materials without claiming a real location; no people, signs, text, logos, watermark or UI. | `e384cc946a67d28411fc389cfade5c6c75f3fcf0691082126b616dece1c63425` |

The fixture's media client supplies synthetic IDs and does not verify the private storage digest. `test_website_section_images.mjs` and `test_website_private_media.mjs` cover the real image record and managed-media contracts separately.
