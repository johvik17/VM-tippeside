const API_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:4000/api"
    : "https://vm-tippeside-api.onrender.com/api");

export async function apiRequest(path, options = {}) {
  if (!API_URL) {
    throw new Error("API-adresse manglar. Set VITE_API_URL til URL-en for backend.");
  }

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
