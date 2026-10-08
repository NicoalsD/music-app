import type { Artwork as ArtworkUrls } from '../../core/Song';
import { Artwork } from '../components/Artwork';
import styles from './DragTicket.module.css';

export interface DragTicketProps {
  title: string;
  albumName: string;
  artwork: ArtworkUrls;
}

/** The compact paper ticket that follows the pointer while a song is dragged. */
export function DragTicket({ title, albumName, artwork }: DragTicketProps) {
  return (
    <div className={styles.ticket}>
      <Artwork artwork={artwork} title={title} album={albumName} size="xs" />
      <span className={styles.title}>{title}</span>
    </div>
  );
}
