import { useEffect, useState } from 'react'
import { thumbUrl, onThumb } from '../lib/images.js'

// Square preview of a collage item (uses its crop).
export default function Thumb({ item, style }) {
  const [url, setUrl] = useState(() => thumbUrl(item))
  useEffect(() => {
    setUrl(thumbUrl(item))
    return onThumb(id => { if (id === item.id) setUrl(thumbUrl(item)) })
  }, [item])
  return url
    ? <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }} />
    : <div className="skeleton" style={{ width: '100%', height: '100%', ...style }} />
}
