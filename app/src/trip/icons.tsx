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
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  Snowflake,
  CloudLightning,
  MapPin,
  Clock,
  Calendar,
  CheckCircle2,
  Circle,
  Footprints,
  Plus,
  Bookmark,
  Map,
  Settings,
  ChevronLeft,
  ChevronRight,
  Building2,
  BedDouble,
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
  ImagePlus,
  X,
  Loader2,
  Upload,
  Download,
  Lightbulb,
  Star,
  Search,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'

import { Landmark, MapPin, Utensils, Coffee, Beer, Wine, Church, ShoppingBag, Theater, Trees, ShoppingCart, Image, Building2, BedDouble, Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, Snowflake, CloudLightning, type LucideIcon } from 'lucide-react'
import type { Stop, StopKind } from '../types'

/**
 * Map a WMO `weather_code` (as returned by Open-Meteo) to a short label and a
 * lucide icon. Pure + unit-tested. Unknown codes fall back to clear/Sun so the
 * glance never renders blank.
 *
 * Buckets: 0 clear → Sun; 1 mainly clear / 2 partly cloudy → CloudSun;
 * 3 overcast → Cloud; 45/48 fog → CloudFog; 51–57 drizzle → CloudDrizzle;
 * 61–67 rain → CloudRain; 71–77 snow → Snowflake; 80–82 showers → CloudRain;
 * 85–86 snow showers → Snowflake; 95–99 thunderstorm → CloudLightning.
 */
export function weatherFromCode(code: number): { label: string; icon: LucideIcon } {
  if (code === 0) return { label: 'clear', icon: Sun }
  if (code === 1 || code === 2) return { label: 'partly cloudy', icon: CloudSun }
  if (code === 3) return { label: 'cloudy', icon: Cloud }
  if (code === 45 || code === 48) return { label: 'fog', icon: CloudFog }
  if (code >= 51 && code <= 57) return { label: 'drizzle', icon: CloudDrizzle }
  if (code >= 61 && code <= 67) return { label: 'rain', icon: CloudRain }
  if (code >= 71 && code <= 77) return { label: 'snow', icon: Snowflake }
  if (code >= 80 && code <= 82) return { label: 'showers', icon: CloudRain }
  if (code === 85 || code === 86) return { label: 'snow showers', icon: Snowflake }
  if (code >= 95 && code <= 99) return { label: 'thunderstorm', icon: CloudLightning }
  return { label: 'clear', icon: Sun }
}

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

/** Keywords that imply a place to eat (matched against type + name). */
const EAT_HINTS = ['restaurant', 'food', 'cafe', 'café', 'bar', 'dining', 'izakaya', 'coffee', 'pub', 'bistro', 'trattoria', 'eatery', 'brunch']
/** Keywords that imply a place to stay (matched against type + name). */
const STAY_HINTS = ['hotel', 'hostel', 'ryokan', 'lodging', 'lodge', 'airbnb', 'stay', 'inn', 'guesthouse', 'resort', 'motel']

/**
 * Derive a stop's coarse category. Honours an explicit `stop.kind`; otherwise
 * infers from `stop.type` and `stop.name` (eat → restaurant/cafe/bar/…, stay →
 * hotel/hostel/lodging/…), defaulting to 'do' for sights and everything else.
 * Pure + unit-tested.
 */
export function stopKind(stop: Pick<Stop, 'kind' | 'type' | 'name'>): StopKind {
  if (stop.kind) return stop.kind
  const hay = `${stop.type ?? ''} ${stop.name ?? ''}`.toLowerCase()
  if (STAY_HINTS.some(h => hay.includes(h))) return 'stay'
  if (EAT_HINTS.some(h => hay.includes(h))) return 'eat'
  return 'do'
}

/** The lucide icon for a category. */
export function kindIcon(kind: StopKind): LucideIcon {
  if (kind === 'eat') return Utensils
  if (kind === 'stay') return BedDouble
  return MapPin
}

/** The user-facing label for a category. */
export function kindLabel(kind: StopKind): string {
  if (kind === 'eat') return 'Eat'
  if (kind === 'stay') return 'Stay'
  return 'Do'
}
