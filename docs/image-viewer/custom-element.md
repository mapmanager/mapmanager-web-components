# Custom Element integration

Importing the registration bundle defines `<mapmanager-image-viewer>`.

```html
<mapmanager-image-viewer id="viewer"></mapmanager-image-viewer>
<script type="module">
  import '@mapmanager/image-viewer/register'

  const viewer = document.querySelector('#viewer')
  await viewer.setSource(source)
</script>
```

Give the element an explicit height. It uses an open shadow root and carries
the viewer stylesheet in its self-contained registration bundle.

The current element API exposes `setSource(source)` and the
`hostClipboardBridge` property. When clipboard bridging is enabled, listen for
the bubbling, composed `copy-view-request` event and perform the requested host
operation.

The Vue widget's ROI and XY-overlay setters are not currently forwarded by the
Custom Element. Do not rely on those methods at this boundary without first
extending its public API.
