const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Shopify Storefront API configuration
const SHOPIFY_STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN || "1234";
const SHOPIFY_STORE_DOMAIN =
  process.env.SHOPIFY_STORE_DOMAIN || "example.myshopify.com";
const STOREFRONT_API_URL = `https://${SHOPIFY_STORE_DOMAIN}/api/2023-10/graphql.json`;

// GraphQL query to fetch products
const PRODUCTS_QUERY = `
  query getProducts($first: Int!) {
    products(first: $first, query: "status:active") {
      edges {
        node {
          id
          title
          description
          handle
          createdAt
          updatedAt
          productType
          vendor
          tags
          availableForSale
          totalInventory
          seo {
            title
            description
          }
          qtyPriceBreaks: metafield(namespace: "custom", key: "qty_price_breaks") {
            id
            namespace
            key
            value
            type
            description
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 5) {
            edges {
              node {
                id
                url
                altText
                width
                height
              }
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                price {
                  amount
                  currencyCode
                }
                compareAtPrice {
                  amount
                  currencyCode
                }
                availableForSale
                quantityAvailable
                selectedOptions {
                  name
                  value
                }
                qtyPriceBreaks: metafield(namespace: "custom", key: "qty_price_breaks") {
                  id
                  namespace
                  key
                  value
                  type
                  description
                }
                image {
                  id
                  url
                  altText
                  width
                  height
                }
                image {
                  id
                  url
                  altText
                  width
                  height
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
      }
    }
  }
`;

// API endpoint to get products
app.get("/api/products", async (req, res) => {
  try {
    const { limit = 10, cursor } = req.query;
    const first = Math.min(parseInt(limit), 250); // Shopify limit is 250

    const variables = {
      first: first,
    };

    // Add cursor for pagination if provided
    if (cursor) {
      variables.after = cursor;
    }

    const response = await axios.post(
      STOREFRONT_API_URL,
      {
        query: PRODUCTS_QUERY,
        variables: variables,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
        },
      }
    );

    if (response.data.errors) {
      return res.status(400).json({
        success: false,
        errors: response.data.errors,
      });
    }

    const products = response.data.data.products.edges.map((edge) => ({
      id: edge.node.id,
      title: edge.node.title,
      description: edge.node.description,
      handle: edge.node.handle,
      createdAt: edge.node.createdAt,
      updatedAt: edge.node.updatedAt,
      productType: edge.node.productType,
      vendor: edge.node.vendor,
      tags: edge.node.tags,
      availableForSale: edge.node.availableForSale,
      totalInventory: edge.node.totalInventory,
      seo: edge.node.seo,
      qtyPriceBreaks: edge.node.qtyPriceBreaks,
      priceRange: edge.node.priceRange,
      images: edge.node.images.edges.map((img) => img.node),
      variants: edge.node.variants.edges.map((variant) => ({
        ...variant.node,
        qtyPriceBreaks: variant.node.qtyPriceBreaks,
      })),
    }));

    res.json({
      success: true,
      data: {
        products: products,
        pageInfo: response.data.data.products.pageInfo,
        totalCount: products.length,
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch products",
      message: error.message,
    });
  }
});

// API endpoint to get a single product by handle
app.get("/api/products/:handle", async (req, res) => {
  try {
    const { handle } = req.params;

    const SINGLE_PRODUCT_QUERY = `
      query getProduct($handle: String!) {
        productByHandle(handle: $handle) {
          id
          title
          description
          handle
          createdAt
          updatedAt
          productType
          vendor
          tags
          availableForSale
          totalInventory
          seo {
            title
            description
          }
          qtyPriceBreaks: metafield(namespace: "custom", key: "qty_price_breaks") {
            id
            namespace
            key
            value
            type
            description
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 10) {
            edges {
              node {
                id
                url
                altText
                width
                height
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                price {
                  amount
                  currencyCode
                }
                compareAtPrice {
                  amount
                  currencyCode
                }
                availableForSale
                quantityAvailable
                selectedOptions {
                  name
                  value
                }
                qtyPriceBreaks: metafield(namespace: "custom", key: "qty_price_breaks") {
                  id
                  namespace
                  key
                  value
                  type
                  description
                }
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      STOREFRONT_API_URL,
      {
        query: SINGLE_PRODUCT_QUERY,
        variables: { handle },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
        },
      }
    );

    if (response.data.errors) {
      return res.status(400).json({
        success: false,
        errors: response.data.errors,
      });
    }

    const product = response.data.data.productByHandle;

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    const formattedProduct = {
      id: product.id,
      title: product.title,
      description: product.description,
      handle: product.handle,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      productType: product.productType,
      vendor: product.vendor,
      tags: product.tags,
      availableForSale: product.availableForSale,
      totalInventory: product.totalInventory,
      seo: product.seo,
      qtyPriceBreaks: product.qtyPriceBreaks,
      priceRange: product.priceRange,
      images: product.images.edges.map((img) => img.node),
      variants: product.variants.edges.map((variant) => ({
        ...variant.node,
        qtyPriceBreaks: variant.node.qtyPriceBreaks,
      })),
    };

    res.json({
      success: true,
      data: formattedProduct,
    });
  } catch (error) {
    console.error("Error fetching product:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch product",
      message: error.message,
    });
  }
});

// API endpoint to get products by page as markdown
app.get("/api/products/markdown/:page", async (req, res) => {
  try {
    const page = parseInt(req.params.page) || 1;
    const productsPerPage = 5;

    // For proper pagination, we need to fetch from the beginning and skip to the desired page
    // This is a simplified approach - in production, you'd want to store cursors
    let cursor = null;
    let currentPage = 1;

    // If we need page 2 or higher, we need to fetch previous pages to get the correct cursor
    if (page > 1) {
      // Fetch all products up to the desired page to get the correct cursor
      const totalProductsToSkip = (page - 1) * productsPerPage;

      const CURSOR_QUERY = `
        query getProductsForCursor($first: Int!) {
          products(first: $first, query: "status:active") {
            edges {
              cursor
            }
          }
        }
      `;

      const cursorResponse = await axios.post(
        STOREFRONT_API_URL,
        {
          query: CURSOR_QUERY,
          variables: { first: totalProductsToSkip },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
          },
        }
      );

      if (cursorResponse.data.data.products.edges.length > 0) {
        cursor =
          cursorResponse.data.data.products.edges[
            cursorResponse.data.data.products.edges.length - 1
          ].cursor;
      }
    }

    const PRODUCTS_QUERY = `
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after, query: "status:active") {
          edges {
            node {
              id
              title
              description
              handle
              createdAt
              updatedAt
              productType
              vendor
              tags
              availableForSale
              totalInventory
              seo {
                title
                description
              }
              qtyPriceBreaks: metafield(namespace: "custom", key: "qty_price_breaks") {
                id
                namespace
                key
                value
                type
                description
              }
              priceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
                maxVariantPrice {
                  amount
                  currencyCode
                }
              }
              images(first: 3) {
                edges {
                  node {
                    id
                    url
                    altText
                    width
                    height
                  }
                }
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price {
                      amount
                      currencyCode
                    }
                    compareAtPrice {
                      amount
                      currencyCode
                    }
                    availableForSale
                    quantityAvailable
                    selectedOptions {
                      name
                      value
                    }
                    image {
                      id
                      url
                      altText
                      width
                      height
                    }
                    qtyPriceBreaks: metafield(namespace: "custom", key: "qty_price_breaks") {
                      id
                      namespace
                      key
                      value
                      type
                      description
                    }
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
          }
        }
      }
    `;

    const variables = {
      first: productsPerPage,
      ...(cursor && { after: cursor }),
    };

    const response = await axios.post(
      STOREFRONT_API_URL,
      {
        query: PRODUCTS_QUERY,
        variables,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
        },
      }
    );

    if (response.data.errors) {
      return res.status(400).json({
        success: false,
        errors: response.data.errors,
      });
    }

    const products = response.data.data.products.edges.map((edge) => edge.node);
    const pageInfo = response.data.data.products.pageInfo;

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No products found for this page",
      });
    }

    // Generate markdown content
    let markdown = `# Products - Page ${page}\n\n`;
    markdown += `**Showing ${products.length} products**\n\n`;

    // Navigation
    markdown += `## Navigation\n\n`;
    if (page > 1) {
      markdown += `[← Previous Page](/api/products/markdown/${page - 1}) | `;
    }
    markdown += `**Page ${page}**`;
    if (pageInfo.hasNextPage) {
      markdown += ` | [Next Page →](/api/products/markdown/${page + 1})`;
    }
    markdown += `\n\n---\n\n`;

    // Process each product
    products.forEach((product, index) => {
      markdown += `# ${index + 1}. ${product.title}\n\n`;

      // SEO Information
      if (product.seo && (product.seo.title || product.seo.description)) {
        markdown += `## SEO Information\n\n`;
        if (product.seo.title) {
          markdown += `**SEO Title:** ${product.seo.title}\n\n`;
        }
        if (product.seo.description) {
          markdown += `**SEO Description:** ${product.seo.description}\n\n`;
        }
      }

      // Product Images (first 3 featured images)
      if (product.images.edges.length > 0) {
        markdown += `## Product Images\n\n`;
        product.images.edges.slice(0, 3).forEach((img, imgIndex) => {
          const image = img.node;
          markdown += `### Image ${imgIndex + 1}\n`;
          markdown += `![${image.altText || product.title}](${image.url})\n\n`;
          markdown += `- **Alt Text:** ${image.altText || "N/A"}\n`;
          markdown += `- **Dimensions:** ${image.width} x ${image.height}px\n\n`;
        });
      }

      // Basic Product Information
      markdown += `## Product Details\n\n`;
      markdown += `- **Handle:** ${product.handle}\n`;
      markdown += `- **Product Type:** ${product.productType || "N/A"}\n`;
      markdown += `- **Vendor:** ${product.vendor || "N/A"}\n`;
      markdown += `- **Available for Sale:** ${
        product.availableForSale ? "Yes" : "No"
      }\n`;
      markdown += `- **Total Inventory:** ${product.totalInventory || "N/A"}\n`;
      markdown += `- **Created:** ${new Date(
        product.createdAt
      ).toLocaleDateString()}\n`;
      markdown += `- **Updated:** ${new Date(
        product.updatedAt
      ).toLocaleDateString()}\n\n`;

      // Tags
      if (product.tags && product.tags.length > 0) {
        markdown += `**Tags:** ${product.tags.join(", ")}\n\n`;
      }

      // Description (truncated for page view)
      if (product.description) {
        const truncatedDesc =
          product.description.length > 200
            ? product.description.substring(0, 200) + "..."
            : product.description;
        markdown += `## Description\n\n${truncatedDesc}\n\n`;
      }

      // Price Range
      markdown += `## Pricing\n\n`;
      const minPrice = product.priceRange.minVariantPrice;
      const maxPrice = product.priceRange.maxVariantPrice;

      if (minPrice.amount === maxPrice.amount) {
        markdown += `**Price:** ${minPrice.currencyCode} ${minPrice.amount}\n\n`;
      } else {
        markdown += `**Price Range:** ${minPrice.currencyCode} ${minPrice.amount} - ${maxPrice.currencyCode} ${maxPrice.amount}\n\n`;
      }

      // Quantity Price Breaks
      if (product.qtyPriceBreaks && product.qtyPriceBreaks.value) {
        markdown += `## Quantity Price Breaks\n\n`;
        markdown += `**Raw Data:** \`${product.qtyPriceBreaks.value}\`\n\n`;

        // Try to parse the price breaks data
        const priceBreaksData = product.qtyPriceBreaks.value.split(";");
        if (priceBreaksData.length >= 2) {
          markdown += `| Quantity | Discount % | Discounted Price | Total Price |\n`;
          markdown += `|----------|------------|------------------|-------------|\n`;

          const basePrice = parseFloat(
            product.priceRange.minVariantPrice.amount
          );

          priceBreaksData.forEach((priceBreak) => {
            const parts = priceBreak.split(":");
            if (parts.length === 2) {
              const quantity = parseInt(parts[0].trim());
              const discountPercent = parseFloat(parts[1].trim());
              const discountedPrice = basePrice * (1 - discountPercent / 100);
              const totalPrice = quantity * discountedPrice;

              markdown += `| ${quantity} | ${discountPercent.toFixed(2)}% | ${
                product.priceRange.minVariantPrice.currencyCode
              } ${discountedPrice.toFixed(2)} | ${
                product.priceRange.minVariantPrice.currencyCode
              } ${totalPrice.toFixed(2)} |\n`;
            }
          });
          markdown += `\n`;
        }
      }

      // Product Variants (showing all variants)
      if (product.variants.edges.length > 0) {
        markdown += `## Product Variants (${product.variants.edges.length} variants)\n\n`;

        product.variants.edges.forEach((variant, varIndex) => {
          const v = variant.node;
          markdown += `### Variant ${varIndex + 1}: ${v.title}\n\n`;

          // Add variant image if available
          if (v.image && v.image.url) {
            markdown += `![${v.image.altText || v.title}](${v.image.url})\n\n`;
          }

          markdown += `- **Price:** ${v.price.currencyCode} ${v.price.amount}\n`;

          if (v.compareAtPrice && v.compareAtPrice.amount) {
            markdown += `- **Compare at Price:** ${v.compareAtPrice.currencyCode} ${v.compareAtPrice.amount}\n`;
          }

          markdown += `- **Available:** ${v.availableForSale ? "Yes" : "No"}\n`;
          markdown += `- **Quantity Available:** ${
            v.quantityAvailable || "N/A"
          }\n`;

          if (v.selectedOptions && v.selectedOptions.length > 0) {
            markdown += `- **Options:**\n`;
            v.selectedOptions.forEach((option) => {
              markdown += `  - ${option.name}: ${option.value}\n`;
            });
          }

          if (v.qtyPriceBreaks && v.qtyPriceBreaks.value) {
            markdown += `- **Quantity Price Breaks:** \`${v.qtyPriceBreaks.value}\`\n`;
          }

          markdown += `\n`;
        });
      }

      // Separator between products
      if (index < products.length - 1) {
        markdown += `---\n\n`;
      }
    });

    // Footer navigation
    markdown += `\n---\n\n## Navigation\n\n`;
    if (page > 1) {
      markdown += `[← Previous Page](/api/products/markdown/${page - 1}) | `;
    }
    markdown += `**Page ${page}**`;
    if (pageInfo.hasNextPage) {
      markdown += ` | [Next Page →](/api/products/markdown/${page + 1})`;
    }
    markdown += `\n\n`;

    // Technical Information
    markdown += `## Technical Information\n\n`;
    markdown += `- **Page:** ${page}\n`;
    markdown += `- **Products per page:** ${productsPerPage}\n`;
    markdown += `- **Products shown:** ${products.length}\n`;
    markdown += `- **Has next page:** ${pageInfo.hasNextPage ? "Yes" : "No"}\n`;
    markdown += `- **Store Domain:** ${SHOPIFY_STORE_DOMAIN}\n`;
    markdown += `- **Generated:** ${new Date().toISOString()}\n\n`;

    // Set content type to text/plain for markdown
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(markdown);
  } catch (error) {
    console.error("Error generating paginated markdown:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to generate paginated markdown",
      message: error.message,
    });
  }
});

// API endpoint to get product as markdown
app.get("/api/products/:handle/markdown", async (req, res) => {
  try {
    const { handle } = req.params;

    const SINGLE_PRODUCT_QUERY = `
      query getProduct($handle: String!) {
        productByHandle(handle: $handle) {
          id
          title
          description
          handle
          createdAt
          updatedAt
          productType
          vendor
          tags
          availableForSale
          totalInventory
          seo {
            title
            description
          }
          qtyPriceBreaks: metafield(namespace: "custom", key: "qty_price_breaks") {
            id
            namespace
            key
            value
            type
            description
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 10) {
            edges {
              node {
                id
                url
                altText
                width
                height
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                price {
                  amount
                  currencyCode
                }
                compareAtPrice {
                  amount
                  currencyCode
                }
                availableForSale
                quantityAvailable
                selectedOptions {
                  name
                  value
                }
                qtyPriceBreaks: metafield(namespace: "custom", key: "qty_price_breaks") {
                  id
                  namespace
                  key
                  value
                  type
                  description
                }
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      STOREFRONT_API_URL,
      {
        query: SINGLE_PRODUCT_QUERY,
        variables: { handle },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
        },
      }
    );

    if (response.data.errors) {
      return res.status(400).json({
        success: false,
        errors: response.data.errors,
      });
    }

    const product = response.data.data.productByHandle;

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Generate markdown content
    let markdown = `# ${product.title}\n\n`;

    // SEO Information
    if (product.seo && (product.seo.title || product.seo.description)) {
      markdown += `## SEO Information\n\n`;
      if (product.seo.title) {
        markdown += `**SEO Title:** ${product.seo.title}\n\n`;
      }
      if (product.seo.description) {
        markdown += `**SEO Description:** ${product.seo.description}\n\n`;
      }
    }

    // Product Images
    if (product.images.edges.length > 0) {
      markdown += `## Product Images\n\n`;
      product.images.edges.forEach((img, index) => {
        const image = img.node;
        markdown += `### Image ${index + 1}\n`;
        markdown += `![${image.altText || product.title}](${image.url})\n\n`;
        markdown += `- **Alt Text:** ${image.altText || "N/A"}\n`;
        markdown += `- **Dimensions:** ${image.width} x ${image.height}px\n`;
        markdown += `- **URL:** [${image.url}](${image.url})\n\n`;
      });
    }

    // Basic Product Information
    markdown += `## Product Details\n\n`;
    markdown += `- **Handle:** ${product.handle}\n`;
    markdown += `- **Product Type:** ${product.productType || "N/A"}\n`;
    markdown += `- **Vendor:** ${product.vendor || "N/A"}\n`;
    markdown += `- **Available for Sale:** ${
      product.availableForSale ? "Yes" : "No"
    }\n`;
    markdown += `- **Total Inventory:** ${product.totalInventory || "N/A"}\n`;
    markdown += `- **Created:** ${new Date(
      product.createdAt
    ).toLocaleDateString()}\n`;
    markdown += `- **Updated:** ${new Date(
      product.updatedAt
    ).toLocaleDateString()}\n\n`;

    // Tags
    if (product.tags && product.tags.length > 0) {
      markdown += `**Tags:** ${product.tags.join(", ")}\n\n`;
    }

    // Description
    if (product.description) {
      markdown += `## Description\n\n${product.description}\n\n`;
    }

    // Price Range
    markdown += `## Pricing\n\n`;
    const minPrice = product.priceRange.minVariantPrice;
    const maxPrice = product.priceRange.maxVariantPrice;

    if (minPrice.amount === maxPrice.amount) {
      markdown += `**Price:** ${minPrice.currencyCode} ${minPrice.amount}\n\n`;
    } else {
      markdown += `**Price Range:** ${minPrice.currencyCode} ${minPrice.amount} - ${maxPrice.currencyCode} ${maxPrice.amount}\n\n`;
    }

    // Quantity Price Breaks
    if (product.qtyPriceBreaks && product.qtyPriceBreaks.value) {
      markdown += `## Quantity Price Breaks\n\n`;
      markdown += `**Raw Data:** \`${product.qtyPriceBreaks.value}\`\n\n`;

      // Try to parse the price breaks data
      const priceBreaksData = product.qtyPriceBreaks.value.split(";");
      if (priceBreaksData.length >= 2) {
        markdown += `| Quantity | Discount % | Discounted Price | Total Price |\n`;
        markdown += `|----------|------------|------------------|-------------|\n`;

        const basePrice = parseFloat(product.priceRange.minVariantPrice.amount);

        priceBreaksData.forEach((priceBreak) => {
          const parts = priceBreak.split(":");
          if (parts.length === 2) {
            const quantity = parseInt(parts[0].trim());
            const discountPercent = parseFloat(parts[1].trim());
            const discountedPrice = basePrice * (1 - discountPercent / 100);
            const totalPrice = quantity * discountedPrice;

            markdown += `| ${quantity} | ${discountPercent.toFixed(2)}% | ${
              product.priceRange.minVariantPrice.currencyCode
            } ${discountedPrice.toFixed(2)} | ${
              product.priceRange.minVariantPrice.currencyCode
            } ${totalPrice.toFixed(2)} |\n`;
          }
        });
        markdown += `\n`;
      }
    }

    // Product Variants
    if (product.variants.edges.length > 0) {
      markdown += `## Product Variants\n\n`;

      product.variants.edges.forEach((variant, index) => {
        const v = variant.node;
        markdown += `### Variant ${index + 1}: ${v.title}\n\n`;

        // Add variant image if available
        if (v.image && v.image.url) {
          markdown += `![${v.image.altText || v.title}](${v.image.url})\n\n`;
        }

        markdown += `- **Price:** ${v.price.currencyCode} ${v.price.amount}\n`;

        if (v.compareAtPrice && v.compareAtPrice.amount) {
          markdown += `- **Compare at Price:** ${v.compareAtPrice.currencyCode} ${v.compareAtPrice.amount}\n`;
        }

        markdown += `- **Available:** ${v.availableForSale ? "Yes" : "No"}\n`;
        markdown += `- **Quantity Available:** ${
          v.quantityAvailable || "N/A"
        }\n`;

        if (v.selectedOptions && v.selectedOptions.length > 0) {
          markdown += `- **Options:**\n`;
          v.selectedOptions.forEach((option) => {
            markdown += `  - ${option.name}: ${option.value}\n`;
          });
        }

        if (v.qtyPriceBreaks && v.qtyPriceBreaks.value) {
          markdown += `- **Quantity Price Breaks:** \`${v.qtyPriceBreaks.value}\`\n`;
        }

        markdown += `\n`;
      });
    }

    // Technical Information
    markdown += `## Technical Information\n\n`;
    markdown += `- **Product ID:** \`${product.id}\`\n`;
    markdown += `- **Store Domain:** ${SHOPIFY_STORE_DOMAIN}\n`;
    markdown += `- **Generated:** ${new Date().toISOString()}\n\n`;

    // Set content type to text/plain for markdown
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(markdown);
  } catch (error) {
    console.error("Error generating markdown:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to generate markdown",
      message: error.message,
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Root endpoint with API documentation
app.get("/", (req, res) => {
  res.json({
    message: "Shopify Product API",
    version: "1.0.0",
    endpoints: {
      "GET /api/products":
        "Get all products (supports ?limit=10&cursor=xyz for pagination)",
      "GET /api/products/:handle": "Get a single product by handle",
      "GET /health": "Health check",
    },
    documentation: {
      "Products endpoint": {
        url: "/api/products",
        method: "GET",
        parameters: {
          limit: "Number of products to fetch (max 250, default 10)",
          cursor: "Pagination cursor for next page",
        },
      },
      "Single product endpoint": {
        url: "/api/products/:handle",
        method: "GET",
        parameters: {
          handle: "Product handle (URL slug)",
        },
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Shopify Product API server running on port ${PORT}`);
  console.log(`📖 API Documentation: http://localhost:${PORT}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`📦 Products: http://localhost:${PORT}/api/products`);
});

module.exports = app;
