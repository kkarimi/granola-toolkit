export function buildGranolaMeetingUrl(baseUrl: URL, meetingId: string): URL {
  const url = new URL(baseUrl);
  if (meetingId.trim()) {
    url.searchParams.set("meeting", meetingId.trim());
  }
  return url;
}
