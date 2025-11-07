# Settings Page Assets

This folder contains all the assets exported from the Figma design for the Settings page.

**Figma Source:** https://www.figma.com/design/64xmxXKnD8cATGW2D0Zm17/Eliza-Cloud-App?m=dev&focus-id=435-3215

## Asset Inventory

### Logo

- **logo.png** (5.6KB) - ELIZA brand logo displayed in the header

### Background Patterns

- **pattern-6px-flip.png** (89B) - 6px repeating pattern texture used on the "Save changes" button

### Icons - Header

- **icon-user-header.svg** (656B) - User icon for the profile button in the header

### Icons - Tab Navigation

- **icon-user-tab.svg** (732B) - User icon for the "General" tab
- **icon-building.svg** (605B) - Building icon for the "Account" tab
- **icon-bar-chart.svg** (340B) - Bar chart icon for the "Usage" tab
- **icon-credit-card.svg** (880B) - Credit card icon for the "Billing" tab
- **icon-key.svg** (1KB) - Key icon for the "APIs" tab
- **icon-pie-chart.svg** (901B) - Pie chart icon for the "Analytics" tab

### UI Elements

- **icon-chevron-down.svg** (332B) - Chevron down icon for dropdown selects

### Decorative Elements

- **corner-bracket-1.svg** (386B) - Corner bracket decoration for cards
- **corner-bracket-2.svg** (386B) - Corner bracket decoration for cards (variant)
- **corner-bracket-3.svg** (386B) - Corner bracket decoration for cards (variant)

## Usage Notes

All assets are exported from Figma and stored on Figma's CDN for 7 days. These local copies ensure availability.

### Recommended Implementation Path

Instead of using these exported assets, consider using:

- **Logo:** Your existing logo in `/public/`
- **Icons:** Your project already uses `lucide-react` icons - map these Figma icons to equivalent Lucide icons
- **Corner brackets:** Your existing `CornerBrackets` component from `@/components/brand`
- **Patterns:** CSS gradients or your existing brand patterns

This approach ensures consistency with your existing design system and component library.
