async function serveAsset(request, env) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return new Response("Static asset binding unavailable", { status: 503 });
  }

  const response = await env.ASSETS.fetch(request);
  if (response.status !== 404) return response;

  const url = new URL(request.url);
  const isDocumentRequest = request.method === "GET"
    && !url.pathname.split("/").at(-1)?.includes(".");
  if (!isDocumentRequest) return response;

  url.pathname = "/index.html";
  return env.ASSETS.fetch(new Request(url, request));
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }
    return serveAsset(request, env);
  },
};
