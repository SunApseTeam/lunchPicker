// Loads each member's face photo, then, once every face is in, the squeezed faces: the ones on
// show first, the ones only seen on a knock after. Each photo tries its URLs in turn. Until a
// photo has loaded, or if none can, the member is drawn with the cartoon face.
export function createFaces(team, urlsFor) {
  const images = new Map();
  // Members whose face photo is still on its way.
  const pending = new Set(team.map((m) => m.id));

  // Resolves once the image is in, or every URL has failed.
  function load(key, urls) {
    return new Promise((resolve) => {
      const [url, ...rest] = urls;
      if (!url) return resolve();
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        images.set(key, img);
        resolve();
      };
      img.onerror = () => load(key, rest).then(resolve);
      img.src = url;
    });
  }

  const faces = team.map((m) => load(m.id, urlsFor(m.id)).then(() => pending.delete(m.id)));
  Promise.all(faces).then(() => {
    for (const m of team) load(`${m.id}-squish`, urlsFor(m.id, 'squish'));
  });

  return {
    face: (member) => images.get(member.id) ?? null,
    squish: (member) => images.get(`${member.id}-squish`) ?? null,
    url: (member) => images.get(member.id)?.src ?? null,
    loading: (member) => pending.has(member.id),
  };
}
