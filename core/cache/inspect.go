package cache

import "sort"

// List returns every cache entry, sorted by key, for `wee cache ls` (CLI wiring
// in M1.9). A cache you can't inspect is a cache you can't trust (PRIN-02).
func (c *Cache) List() ([]Entry, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.ensureLoaded(); err != nil {
		return nil, err
	}
	out := make([]Entry, 0, len(c.index))
	for _, e := range c.index {
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out, nil
}

// Inspect returns the entry recorded for key, for `wee cache inspect <key>`.
// The recorded artifact bytes are fetched separately from the artifact store by
// the entry's ArtifactHash — the cache holds only the reference. The engine
// reconstructs a hit's events fresh (a stored event stream would carry a stale
// executionID and break the new log's hash chain), so an entry records the node
// result, not a verbatim event log.
func (c *Cache) Inspect(key string) (Entry, bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.ensureLoaded(); err != nil {
		return Entry{}, false, err
	}
	e, ok := c.index[key]
	return e, ok, nil
}

// Clear deletes every cache entry (`wee cache clear`). Artifacts in the shared
// store are left untouched — other executions and the audit trail still
// reference them; only the cache index is emptied.
func (c *Cache) Clear() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.index = make(map[string]Entry)
	c.loaded = true
	return c.save()
}
