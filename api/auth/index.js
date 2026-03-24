export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  return res.status(200).json({ ping: true, method: req.method, url: req.url });
}
