# Shopify Product API

A Node.js Express API that fetches products from Shopify using the Storefront API.

## Features

- ✅ Fetch all products with pagination support
- ✅ Get single product by handle
- ✅ Built-in error handling
- ✅ CORS enabled
- ✅ Health check endpoint
- ✅ Comprehensive product data including variants and images
- ✅ SEO metadata support (title, description)
- ✅ Quantity price breaks metafield for products and variants

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and update it with your Shopify store domain:

```bash
cp .env.example .env
```

Edit `.env` and replace `your-store` with your actual Shopify store name:

```env
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
PORT=3000
```

### 3. Start the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Get All Products

```http
GET /api/products
```

**Query Parameters:**
- `limit` (optional): Number of products to fetch (1-250, default: 10)
- `cursor` (optional): Pagination cursor for next page

**Example:**
```bash
curl "http://localhost:3000/api/products?limit=5"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "gid://shopify/Product/123456789",
        "title": "Product Name",
        "description": "Product description",
        "handle": "product-handle",
        "createdAt": "2023-01-01T00:00:00Z",
        "updatedAt": "2023-01-01T00:00:00Z",
        "productType": "Type",
        "vendor": "Vendor Name",
        "tags": ["tag1", "tag2"],
        "availableForSale": true,
        "totalInventory": 100,
        "seo": {
          "title": "SEO optimized product title",
          "description": "SEO meta description for the product"
        },
        "qtyPriceBreaks": {
          "id": "gid://shopify/Metafield/123",
          "namespace": "custom",
          "key": "qty_price_breaks",
          "value": "1:0:2.27272727272727273:3:8.31818181818181818",
          "type": "single_line_text_field",
          "description": "Quantity price breaks data"
        },
        "priceRange": {
          "minVariantPrice": {
            "amount": "10.00",
            "currencyCode": "USD"
          },
          "maxVariantPrice": {
            "amount": "20.00",
            "currencyCode": "USD"
          }
        },
        "images": [
          {
            "id": "gid://shopify/ProductImage/123",
            "url": "https://cdn.shopify.com/image.jpg",
            "altText": "Alt text",
            "width": 800,
            "height": 600
          }
        ],
        "variants": [
          {
            "id": "gid://shopify/ProductVariant/123",
            "title": "Default Title",
            "price": {
              "amount": "15.00",
              "currencyCode": "USD"
            },
            "compareAtPrice": null,
            "availableForSale": true,
            "quantityAvailable": 50,
            "selectedOptions": [
              {
                "name": "Size",
                "value": "Medium"
              }
            ],
            "qtyPriceBreaks": {
              "id": "gid://shopify/Metafield/456",
              "namespace": "custom",
              "key": "qty_price_breaks",
              "value": "1:0:2.27272727272727273:3:8.31818181818181818",
              "type": "single_line_text_field",
              "description": "Quantity price breaks data for variant"
            }
          }
        ]
      }
    ],
    "pageInfo": {
      "hasNextPage": true,
      "hasPreviousPage": false
    },
    "totalCount": 1
  }
}
```

### Get Single Product

```http
GET /api/products/:handle
```

**Parameters:**
- `handle`: Product handle (URL slug)

**Example:**
```bash
curl "http://localhost:3000/api/products/my-product-handle"
```

### Get Product as Markdown

```http
GET /api/products/markdown/:page
```

**Parameters:**
- `page`: Page number (starting from 1)

**Description:** Retrieve products by page (5 products per page) formatted as a markdown document with all fields properly laid out including images

**Response:** Markdown formatted text document

**Content-Type:** `text/plain; charset=utf-8`

**Example:**
```bash
curl "http://localhost:3000/api/products/markdown/1"
```

**Sample Paginated Markdown Output:**
```markdown
# Products - Page 1

**Showing 5 products**

## Navigation

**Page 1** | [Next Page →](/api/products/markdown/2)

---

# 1. Product Title One

## SEO Information

**SEO Title:** Custom SEO Title
**SEO Description:** Custom SEO description for better search visibility

## Product Images

### Image 1
![Sample Product](https://cdn.shopify.com/s/files/1/sample-image.jpg)

- **Alt Text:** Sample product image
- **Dimensions:** 800 x 800px

### Image 2
![Sample Product 2](https://cdn.shopify.com/s/files/1/sample-image-2.jpg)

- **Alt Text:** Another product view
- **Dimensions:** 800 x 800px

### Image 3
![Sample Product 3](https://cdn.shopify.com/s/files/1/sample-image-3.jpg)

- **Alt Text:** Third product view
- **Dimensions:** 800 x 800px

## Product Details

- **Handle:** product-one
- **Product Type:** Electronics
- **Vendor:** My Store
- **Available for Sale:** Yes
- **Total Inventory:** 50
- **Created:** 1/15/2024
- **Updated:** 1/20/2024

**Tags:** electronics, gadget, popular

## Description

This is a detailed product description with all the features and benefits...

## Pricing

**Price:** USD 29.99

## Quantity Price Breaks

**Raw Data:** `1:0;2:8.035714285714286;3:10.714285714285714;4:11.160714285714286`

| Quantity | Discount % | Discounted Price | Total Price |
|----------|------------|------------------|-------------|
| 1 | 0.00% | USD 29.99 | USD 29.99 |
| 2 | 8.04% | USD 27.58 | USD 55.16 |
| 3 | 10.71% | USD 26.78 | USD 80.34 |
| 4 | 11.16% | USD 26.64 | USD 106.56 |

## Product Variants (3 variants)

### Variant 1: Default Title

![Default Title](https://cdn.shopify.com/s/files/1/variant-image.jpg)

- **Price:** USD 29.99
- **Available:** Yes
- **Quantity Available:** 50
- **Options:**
  - Color: Blue
  - Size: Medium
- **Quantity Price Breaks:** `1:0;2:8.035714285714286;3:10.714285714285714;4:11.160714285714286`

### Variant 2: Blue / Large

![Blue Large Variant](https://cdn.shopify.com/s/files/1/variant-image-2.jpg)

- **Price:** USD 32.99
- **Available:** Yes
- **Quantity Available:** 25
- **Options:**
  - Color: Blue
  - Size: Large
- **Quantity Price Breaks:** `1:0;2:8.035714285714286;3:10.714285714285714;4:11.160714285714286`

### Variant 3: Red / Medium

![Red Medium Variant](https://cdn.shopify.com/s/files/1/variant-image-3.jpg)

- **Price:** USD 29.99
- **Available:** Yes
- **Quantity Available:** 40
- **Options:**
  - Color: Red
  - Size: Medium
- **Quantity Price Breaks:** `1:0;2:8.035714285714286;3:10.714285714285714;4:11.160714285714286`

---

# 2. Product Title Two

[... similar structure for remaining 4 products ...]

---

## Navigation

**Page 1** | [Next Page →](/api/products/markdown/2)

## Technical Information

- **Page:** 1
- **Products per page:** 5
- **Products shown:** 5
- **Has next page:** Yes
- **Store Domain:** my-store.myshopify.com
- **Generated:** 2024-01-20T10:30:00.000Z
```

### Get Product as Markdown

```http
GET /api/products/:handle/markdown
```

**Parameters:**
- `handle`: Product handle (URL slug)

**Description:** Retrieve a specific product formatted as a markdown document with all fields properly laid out including images

**Response:** Markdown formatted text document

**Content-Type:** `text/plain; charset=utf-8`

**Example:**
```bash
curl "http://localhost:3000/api/products/my-product-handle/markdown"
```

**Sample Markdown Output:**
```markdown
# Product Title

## SEO Information

**SEO Title:** Custom SEO Title
**SEO Description:** Custom SEO description for better search visibility

## Product Images

### Image 1
![Product Image](https://cdn.shopify.com/s/files/1/image.jpg)

- **Alt Text:** Product main image
- **Dimensions:** 800 x 600px
- **URL:** [https://cdn.shopify.com/s/files/1/image.jpg](https://cdn.shopify.com/s/files/1/image.jpg)

## Product Details

- **Handle:** my-product-handle
- **Product Type:** Electronics
- **Vendor:** My Store
- **Available for Sale:** Yes
- **Total Inventory:** 50
- **Created:** 1/15/2024
- **Updated:** 1/20/2024

**Tags:** electronics, gadget, popular

## Description

This is a detailed product description with all the features and benefits.

## Pricing

**Price:** USD 29.99

## Quantity Price Breaks

**Raw Data:** `1:0;2:8.035714285714286;3:10.714285714285714;4:11.160714285714286`

| Quantity | Discount % | Discounted Price | Total Price |
|----------|------------|------------------|-------------|
| 1 | 0.00% | USD 29.99 | USD 29.99 |
| 2 | 8.04% | USD 27.58 | USD 55.16 |
| 3 | 10.71% | USD 26.78 | USD 80.34 |
| 4 | 11.16% | USD 26.64 | USD 106.56 |

## Product Variants

### Variant 1: Default Title

![Default Title](https://cdn.shopify.com/s/files/1/variant-image.jpg)

- **Image Alt Text:** Variant image
- **Image Dimensions:** 600 x 600px
- **Image URL:** [https://cdn.shopify.com/s/files/1/variant-image.jpg](https://cdn.shopify.com/s/files/1/variant-image.jpg)
- **Price:** USD 29.99
- **Available:** Yes
- **Quantity Available:** 50
- **Options:**
  - Color: Blue
  - Size: Medium
- **Quantity Price Breaks:** `1:0;2:8.035714285714286;3:10.714285714285714;4:11.160714285714286`

## Technical Information

- **Product ID:** `gid://shopify/Product/123456789`
- **Store Domain:** my-store.myshopify.com
- **Generated:** 2024-01-20T10:30:00.000Z
```

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2023-12-01T12:00:00.000Z"
}
```

### API Documentation

```http
GET /
```

Returns API documentation and available endpoints.

## Configuration

### Shopify Storefront Access Token

The API uses the provided Storefront Access Token:
```
X-Shopify-Storefront-Access-Token: 00f83946d62e103ffba900196f9a8949
```

This token is already configured in the `server.js` file.

### Environment Variables

- `SHOPIFY_STORE_DOMAIN`: Your Shopify store domain (e.g., `your-store.myshopify.com`)
- `PORT`: Server port (default: 3000)

## Error Handling

The API includes comprehensive error handling:

- **400 Bad Request**: GraphQL errors from Shopify
- **404 Not Found**: Product not found
- **500 Internal Server Error**: Server or network errors

Error responses follow this format:
```json
{
  "success": false,
  "error": "Error description",
  "message": "Detailed error message"
}
```

## Development

### Scripts

- `npm start`: Start the server in production mode
- `npm run dev`: Start the server in development mode with auto-reload

### Dependencies

- **express**: Web framework
- **cors**: Cross-origin resource sharing
- **axios**: HTTP client for API requests
- **dotenv**: Environment variable management
- **nodemon**: Development auto-reload (dev dependency)

## GraphQL Queries

The API uses Shopify's Storefront API with GraphQL. The queries fetch comprehensive product data including:

- Basic product information (title, description, handle, etc.)
- Pricing and inventory data
- Product images
- Product variants with options
- Pagination support

## License

MIT License