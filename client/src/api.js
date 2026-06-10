const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("vmTippeToken");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message ?? "Noko gjekk gale.");
  }
  return data;
}
