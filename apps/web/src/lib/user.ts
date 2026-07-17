// Interim anonymous identity until wallet connect (day 2) replaces it.
const KEY = "underdog:userId";

export function getUserId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
