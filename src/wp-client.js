const DEFAULT_PER_PAGE = 100;

export class WPClient {
  constructor({ baseUrl, username, appPassword } = {}) {
    if (!baseUrl) throw new Error("WPClient: baseUrl is required");
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiRoot = `${this.baseUrl}/wp-json/wp/v2`;
    this.authHeader = username && appPassword
      ? "Basic " + Buffer.from(`${username}:${appPassword}`).toString("base64")
      : null;
  }

  async request(path, { query, method = "GET", body, headers = {} } = {}) {
    const url = new URL(path.startsWith("http") ? path : `${this.apiRoot}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const finalHeaders = { Accept: "application/json", ...headers };
    if (this.authHeader) finalHeaders.Authorization = this.authHeader;
    if (body !== undefined) finalHeaders["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WP ${method} ${url.pathname} -> ${res.status}: ${text.slice(0, 500)}`);
    }

    const totalPages = Number(res.headers.get("x-wp-totalpages") || "1");
    const total = Number(res.headers.get("x-wp-total") || "0");
    const data = await res.json();
    return { data, totalPages, total, response: res };
  }

  async site() {
    const res = await fetch(`${this.baseUrl}/wp-json/`, {
      headers: this.authHeader ? { Authorization: this.authHeader } : {},
    });
    if (!res.ok) throw new Error(`Failed to read site root: ${res.status}`);
    const json = await res.json();
    return {
      name: json.name,
      description: json.description,
      url: json.url,
      home: json.home,
      namespaces: json.namespaces,
    };
  }

  listPosts(params = {}) {
    return this.request("/posts", { query: { per_page: DEFAULT_PER_PAGE, ...params } });
  }

  getPost(id, params = {}) {
    return this.request(`/posts/${id}`, { query: params });
  }

  listPages(params = {}) {
    return this.request("/pages", { query: { per_page: DEFAULT_PER_PAGE, ...params } });
  }

  getPage(id, params = {}) {
    return this.request(`/pages/${id}`, { query: params });
  }

  listMedia(params = {}) {
    return this.request("/media", { query: { per_page: DEFAULT_PER_PAGE, ...params } });
  }

  listCategories(params = {}) {
    return this.request("/categories", { query: { per_page: DEFAULT_PER_PAGE, ...params } });
  }

  listTags(params = {}) {
    return this.request("/tags", { query: { per_page: DEFAULT_PER_PAGE, ...params } });
  }

  search(term, params = {}) {
    return this.request("/search", { query: { search: term, per_page: 20, ...params } });
  }

  async *paginate(method, params = {}) {
    let page = 1;
    while (true) {
      const { data, totalPages } = await this[method]({ ...params, page });
      for (const item of data) yield item;
      if (page >= totalPages) return;
      page += 1;
    }
  }
}

export function clientFromEnv(env = process.env) {
  return new WPClient({
    baseUrl: env.WP_BASE_URL,
    username: env.WP_USERNAME || undefined,
    appPassword: env.WP_APP_PASSWORD || undefined,
  });
}
