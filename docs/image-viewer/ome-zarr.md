# OME-Zarr

The viewer supports the same display behavior for network and browser-selected
local OME-Zarr data.

## Remote source

```ts
const source = {
  kind: 'ome-zarr' as const,
  id: 'remote-image',
  url: 'https://example.org/image.ome.zarr',
}

await viewer.setSource(source)
```

The server must permit browser access to Zarr metadata and chunks, including
the required cross-origin requests.

## Local directory

Browsers do not allow an application to read an arbitrary `file://` directory.
Use the directory picker and pass the resulting readable store:

```ts
import {
  BrowserDirectoryStore,
  browserDirectoryPickerSupported,
  pickOmeZarrDirectory,
} from '@mapmanager/image-viewer'

if (browserDirectoryPickerSupported()) {
  const directory = await pickOmeZarrDirectory()
  await viewer.setSource({
    kind: 'ome-zarr',
    id: 'local-image',
    store: new BrowserDirectoryStore(directory),
  })
}
```

The user should select the directory that is itself the OME-Zarr image root,
containing the relevant Zarr metadata. Directory-picker support is
browser-dependent, so clients should disable or explain this action when
`browserDirectoryPickerSupported()` is false.

The browser grants access through the selected directory handle; no upload or
development HTTP server is required.
