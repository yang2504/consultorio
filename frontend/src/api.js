export async function api(path, { method = 'GET', body, download = false } = {}) {
  const response = await fetch('/api' + path, {
    method,
    headers: { 'X-Consultorio': 'local', ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body)
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const error = new Error(result.error || 'No se pudo conectar con el consultorio.');
    error.status = response.status;
    throw error;
  }
  return download ? response.blob() : response.json();
}
