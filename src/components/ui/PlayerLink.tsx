import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PlayerLinkProps {
  /** Local row id, or the Rocket League PrimaryId. Either resolves. */
  player: number | string | null | undefined;
  name: string;
  className?: string;
}

/**
 * Opens a player's profile from anywhere they're named.
 *
 * Falls back to plain text when there's no id to link to, so callers don't
 * have to branch.
 */
export function PlayerLink({ player, name, className }: PlayerLinkProps) {
  const hasId =
    player !== null && player !== undefined && String(player).length > 0;

  if (!hasId) {
    return <span className={cn("truncate", className)}>{name}</span>;
  }

  return (
    <Link
      to={`/players/${encodeURIComponent(String(player))}`}
      title={name}
      className={cn(
        "truncate rounded-sm hover:text-accent-primary hover:underline",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        className,
      )}
    >
      {name}
    </Link>
  );
}
