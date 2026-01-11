import { SystemState } from "../src/core/state";

export function render(ctx: CanvasRenderingContext2D, state: SystemState) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Background
  ctx.fillStyle = "#0b0e14";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Pressure bar
  const p = Math.min(state.metrics.pressure, 2);
  ctx.fillStyle = p < 1 ? "#4caf50" : p < 1.2 ? "#ff9800" : "#f44336";
  ctx.fillRect(20, 20, p * 300, 20);

  ctx.fillStyle = "#fff";
  ctx.fillText(`Pressure`, 20, 15);

  // Tasks
  let y = 70;
  for (const t of state.tasks) {
    ctx.fillStyle =
      t.status === "running"
        ? "#2196f3"
        : t.status === "queued"
        ? "#9e9e9e"
        : t.status === "completed"
        ? "#4caf50"
        : "#f44336";

    ctx.fillRect(20, y, t.progress * 200, 10);
    ctx.fillText(`${t.id.slice(0, 4)} (${t.phase})`, 230, y + 10);
    y += 18;
  }
}
