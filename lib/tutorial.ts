// Returns a YouTube search URL with extra context for better form videos.
export function getExerciseTutorialUrl(exerciseName: string): string {
  const cleaned = exerciseName
    .replace(/[—–−]/g, " ")
    .replace(/[/.,()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const query = `how to do ${cleaned} proper form gym exercise`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query).replace(/%20/g, "+")}`;
}
