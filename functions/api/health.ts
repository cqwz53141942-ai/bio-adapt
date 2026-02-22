export const onRequestGet: PagesFunction = async () => {
return Response.json({ ok: true, ts: new Date().toISOString() })
}