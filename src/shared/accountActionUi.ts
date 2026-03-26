export function getAccountActionHint(accountCount: number, selectedCount: number): string {
  if (accountCount <= 0) {
    return '当前还没有账号，导出和删除会在首次注册成功后开放。';
  }

  if (selectedCount > 0) {
    return `当前已选中 ${selectedCount} 个账号，导出和删除将只作用于选中项。`;
  }

  return '当前会对全部账号执行导出；删除前请先勾选要移除的账号。';
}
