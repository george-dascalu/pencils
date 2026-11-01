// All history surfaces share bounded pages; opening a version fetches its contents separately.
export function historyPages(api, file) {
  const base = `/history?${new URLSearchParams({ file })}`;
  let cursor = "", done = false;
  return {
    async more() {
      if (done) return { versions: [], next: null };
      const page = await api(`${base}&cursor=${encodeURIComponent(cursor)}`);
      cursor = page.next; done = !cursor;
      return page;
    },
    version: revision => api(`${base}&version=${encodeURIComponent(revision)}`),
  };
}
