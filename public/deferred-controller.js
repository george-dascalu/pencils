// Optional controllers install their listeners only when their view is first used.
export function deferredController(factory, defaults = {}, asyncMethods = []) {
  let instance, loading;
  const load = () => loading ||= factory().then(value => (instance = value)).catch(error => {
    loading = null;
    throw error;
  });
  const methods = new Map();
  return {
    ready: () => !!instance,
    load,
    controller: new Proxy({}, {
      get(_, key) {
        if (!methods.has(key)) methods.set(key, (...args) => {
          if (instance) return instance[key]?.(...args);
          if (asyncMethods.includes(key)) return load().then(value => value[key]?.(...args));
          return typeof defaults[key] === "function" ? defaults[key](...args) : defaults[key];
        });
        return methods.get(key);
      },
    }),
  };
}
