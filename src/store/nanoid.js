export const nanoid = () =>
  Math.random().toString(36).slice(2, 11) + Date.now().toString(36)
