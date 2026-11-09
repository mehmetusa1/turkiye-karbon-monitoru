// Görünüm kayıt defteri: her modül kendi rotası için hook kaydeder.
// init(data): ilk açılışta bir kez; show(data, params): her açılışta; hide(): ayrılırken.
// static: true ise veri yüklenemese bile çalışır (örn. Yöntem sayfası).
export const viewHooks = new Map();

export function onView(route, hooks) {
  viewHooks.set(route, hooks);
}
