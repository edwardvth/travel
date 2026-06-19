/**
 * Central re-export of the lucide-react icons used across the planner. Keeping
 * them in one place gives the planner a single, consistent icon vocabulary
 * (SVG only — no emoji anywhere in the UI) and makes swaps trivial.
 *
 * lucide icons accept the standard SVG props (size, strokeWidth, className,
 * aria-hidden) and inherit `currentColor`, so they theme automatically.
 */
export {
  Sun,
  MapPin,
  Clock,
  Footprints,
  Plus,
  Bookmark,
  Map,
  Settings,
  ChevronLeft,
  ChevronRight,
  Building2,
  Utensils,
  Camera,
  Check,
  GripVertical,
  Trash2,
  CalendarDays,
  Share2,
  Sparkles,
  Landmark,
  Coffee,
  Beer,
  Wine,
  Church,
  ShoppingBag,
  Theater,
  Trees,
  ShoppingCart,
  Image,
  Loader2,
  Upload,
  Download,
  Lightbulb,
  Star,
  Search,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'

import { Landmark, MapPin, Utensils, Coffee, Beer, Wine, Church, ShoppingBag, Theater, Trees, ShoppingCart, Image, Building2, type LucideIcon } from 'lucide-react'

/**
 * Map a legacy `stop.type` string to a lucide icon component (replaces the old
 * emoji `stopTypeEmoji`). Falls back to a map pin.
 */
export function stopTypeIcon(type: string | undefined): LucideIcon {
  const t = (type || '').toLowerCase()
  const map: Record<string, LucideIcon> = {
    restaurant: Utensils,
    cafe: Coffee,
    pub: Beer,
    bar: Wine,
    museum: Landmark,
    church: Church,
    hotel: Building2,
    shop: ShoppingBag,
    theatre: Theater,
    park: Trees,
    market: ShoppingCart,
    gallery: Image,
    monument: Landmark,
  }
  return map[t] || MapPin
}
