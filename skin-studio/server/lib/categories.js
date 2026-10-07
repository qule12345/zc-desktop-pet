export const CATEGORIES = {
  skin: ['官方', '角色', '主题', '特效', '其他'],
  plugin: ['官方', '绘制', '交互', '工具', '其他'],
}

export function normalizeCategory(kind, raw) {
  const list = CATEGORIES[kind === 'plugin' ? 'plugin' : 'skin']
  const s = String(raw || '').trim()
  return list.includes(s) ? s : '其他'
}
