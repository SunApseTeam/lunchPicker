// Loads each member's face photo (and squeezed face, once there is one), trying each URL in
// turn. Until a photo has loaded, or if none can, the member is drawn with the cartoon face.
export function createFaces(team, urlsFor) {
  const images = new Map();

  function load(key, urls) {
    const [url, ...rest] = urls;
    if (!url) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => images.set(key, img);
    img.onerror = () => load(key, rest);
    img.src = url;
  }

  for (const m of team) {
    load(m.id, urlsFor(m.id));
    load(`${m.id}-squish`, urlsFor(m.id, 'squish'));
  }

  return {
    face: (member) => images.get(member.id) ?? null,
    squish: (member) => images.get(`${member.id}-squish`) ?? null,
    url: (member) => images.get(member.id)?.src ?? null,
  };
}
