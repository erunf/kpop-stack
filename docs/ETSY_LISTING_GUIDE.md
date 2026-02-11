# Etsy Listing Setup Guide

This guide shows you exactly how to create your Etsy listing so that orders are automatically processed by the Map Memory system.

---

## Overview

The system reads personalization fields from Etsy orders to generate custom map artwork. For automation to work, your listing must have specific personalization fields.

---

## Step 1: Create Your Listing

1. Go to your Etsy Shop Manager
2. Click "Listings" → "Add a listing"
3. Fill in the basic details:
   - **Title**: "Personalized Location Map Beer Can Glass - Custom Address Art - Housewarming Gift"
   - **Category**: Home & Living > Kitchen & Dining > Drinkware > Drinking Glasses
   - **Type**: A physical item

---

## Step 2: Add Photos

Upload photos showing:
1. The glass with a sample map design
2. Close-up of the etched map detail
3. Glass in use/lifestyle shot
4. Multiple angle views
5. Size comparison (optional but helpful)

**Tip**: Use mockups initially, then replace with real product photos once you receive samples.

---

## Step 3: Set Up Personalization (CRITICAL)

This is the most important step. The personalization fields must be set up exactly as described.

1. Scroll to "Personalization" section
2. Toggle ON "Add personalization"
3. Click "Add a personalization field"

### Field 1: Address (Required)

- **Label**: `Address`
- **Placeholder text**: `Enter the full address (e.g., 225 Summit Ave, Summit NJ 07901)`
- **Required**: Yes
- **Character limit**: 200

### Field 2: Custom Text (Required)

- **Label**: `Custom Text`
- **Placeholder text**: `Text to appear below the map (e.g., Our First Home, EST. 2024)`
- **Required**: Yes
- **Character limit**: 50

### Alternative: Single Combined Field

You can also use a single field with multiple lines:

- **Label**: `Personalization Details`
- **Instructions**:
```
Please provide:
Address: [full address for the map]
Text: [text to appear on the glass]
```
- **Required**: Yes
- **Character limit**: 300

---

## Step 4: Set Pricing

Recommended pricing structure:

| Cost Component | Amount |
|---------------|--------|
| Product cost (from Printify) | ~$13-15 |
| Your profit margin | $15-20 |
| **Selling Price** | **$29.99 - $34.99** |

Consider offering:
- **Free shipping** (build into price)
- **Volume discounts** for multiple glasses

---

## Step 5: Set Processing Time

**Important**: Set realistic processing time to account for:
- Order processing: 1-2 days
- Printify production: 2-5 business days
- Shipping: varies by location

**Recommended setting**: 5-7 business days

---

## Step 6: Shipping Profile

Create a shipping profile or use existing:

1. **Origin country**: United States
2. **Processing time**: 3-5 business days
3. **Shipping services**:
   - Domestic (US): USPS Priority (3-5 days)
   - International: USPS First Class International (varies)

**Cost strategy**:
- Free shipping (recommended) - build $5-8 into product price
- Or calculated shipping at checkout

---

## Step 7: Writing Your Description

Here's a template you can customize:

```
Transform a meaningful address into beautiful art on this premium 16oz beer can glass. Perfect for commemorating:

• Your first home together
• Where you got engaged
• A favorite vacation spot
• Where you met your best friend
• A memorable location from your past

HOW TO ORDER:
1. Enter the full address (include city, state, and zip for best results)
2. Add custom text (like "Our First Home" or "EST. 2024")
3. We'll create your personalized map design and ship it to you!

DETAILS:
• 16oz beer can shaped glass
• Laser-etched map design (permanent, dishwasher safe)
• Black and white artistic map style
• Heart marks your exact location
• Custom text below the map

PROCESSING & SHIPPING:
• Processing: 3-5 business days
• Shipping: 3-7 business days (US)
• Each glass is made to order just for you

CARE INSTRUCTIONS:
• Dishwasher safe (top rack recommended)
• Hand washing prolongs the life of the etching

QUESTIONS?
Message us if you have any questions about your order!
```

---

## Step 8: Tags (SEO)

Add these tags to help customers find your listing:

1. personalized glass
2. custom map glass
3. housewarming gift
4. first home gift
5. location map art
6. beer can glass
7. etched glass
8. custom address gift
9. anniversary gift
10. new home gift
11. coordinates gift
12. personalized drinkware
13. custom bar glass

---

## Step 9: Set as Digital Delivery (Optional)

If you want to offer digital-only (no physical product):

1. Create a separate listing
2. Set type as "Digital download"
3. Include the high-res PNG and SVG files
4. Lower price point ($9.99 - $14.99)

---

## Example Listings That Work Well

### Listing 1: Basic Map Glass
- Title: "Custom Location Map Beer Glass - Personalized Address Art"
- Price: $29.99
- Personalization: Address + Custom Text

### Listing 2: Couples Gift Bundle
- Title: "Set of 2 Personalized Map Glasses - Where We Met"
- Price: $54.99 (slight discount for bundle)
- Personalization: Address + Custom Text

### Listing 3: Corporate/Event
- Title: "Bulk Custom Map Glasses - Company Event Gift"
- Price: Starts at $24.99/glass (10+ quantity)
- Personalization: Address + Company Name

---

## Common Personalization Formats

The system can parse these formats:

### Format 1: Separate Fields
```
Address: 123 Main Street, Anytown, CA 90210
Custom Text: Our First Home
```

### Format 2: Combined Field
```
Address: 123 Main Street, Anytown, CA 90210
Text: Our First Home
```

### Format 3: Natural Language
```
Map address: 123 Main Street, Anytown, CA 90210
Message to print: Our First Home
```

---

## Troubleshooting Personalization

### "Address not found"
- Customer entered incomplete address
- Solution: Reach out and ask for city/state/zip

### "Custom text too long"
- Text exceeds recommended 40 characters
- Solution: Ask customer for shortened version

### "No personalization provided"
- Customer didn't fill out the fields
- Solution: Etsy should require them, but contact customer if blank

---

## Automation Tips

1. **Test your listing**: Place a test order yourself to verify the flow
2. **Check Airtable**: Orders should appear automatically after polling
3. **Monitor failed orders**: Check admin dashboard for any processing errors
4. **Response time**: Enable Etsy notifications for order messages

---

## Photography Tips

### DIY Product Photos

1. **Lighting**: Natural light near a window, or softbox lights
2. **Background**: White seamless paper or lifestyle setting
3. **Props**: Include items that suggest use (drinks, bar setting)
4. **Angles**: Straight-on, 45-degree, and overhead shots

### Mockup Resources

- Placeit.net (paid, high quality)
- Canva (free mockups available)
- Printify mockups (free with account)

---

## Seasonal Marketing Ideas

| Season | Theme | Custom Text Ideas |
|--------|-------|-------------------|
| Spring | New beginnings | "Our Fresh Start" |
| Summer | Vacation spots | "Summer 2024" |
| Fall | Football/cozy | "Home Sweet Home" |
| Winter | Holidays | "Where Christmas Happens" |

---

## Next Steps

1. Create your listing following this guide
2. Set up the Map Memory system (see SETUP_GUIDE.md)
3. Connect your Etsy account in the admin dashboard
4. Place a test order
5. Verify automation works
6. Launch and promote!

Good luck with your map merchandise business!
