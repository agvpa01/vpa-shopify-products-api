const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
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
          onlineStoreUrl
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
      onlineStoreUrl: edge.node.onlineStoreUrl,
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

// API endpoint to show all products organized by pages
app.get("/api/products/pages", async (req, res) => {
  try {
    // Get total product count first
    const totalProductCount = await getTotalProductCount();
    const productsPerPage = 5;
    const totalPages = Math.ceil(parseInt(totalProductCount) / productsPerPage);

    // Fetch all products to organize them by pages
    let allProducts = [];
    let cursor = null;
    let hasNextPage = true;
    let iterations = 0;
    const maxIterations = 20; // Prevent infinite loops

    while (hasNextPage && iterations < maxIterations) {
      const PRODUCTS_QUERY = `
        query getProducts($first: Int!, $after: String) {
          products(first: $first, after: $after, query: "status:active") {
            edges {
              node {
                id
                title
                handle
                onlineStoreUrl
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;

      const variables = {
        first: 250,
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

      const products = response.data.data.products;
      allProducts = allProducts.concat(products.edges.map(edge => edge.node));
      hasNextPage = products.pageInfo.hasNextPage;
      cursor = products.edges.length > 0 ? products.edges[products.edges.length - 1].cursor : null;
      iterations++;
    }

    // Generate markdown content
    let markdown = `# All Products by Pages\n\n`;
    markdown += `**Total Products in Store:** ${totalProductCount}\n\n`;
    markdown += `**Products per Page:** ${productsPerPage}\n\n`;
    markdown += `**Total Pages:** ${totalPages}\n\n`;
    markdown += `---\n\n`;

    // Organize products by pages
    for (let page = 1; page <= totalPages; page++) {
      const startIndex = (page - 1) * productsPerPage;
      const endIndex = Math.min(startIndex + productsPerPage, allProducts.length);
      const pageProducts = allProducts.slice(startIndex, endIndex);

      if (pageProducts.length === 0) break;

      markdown += `## [Page ${page}](/api/products/markdown/${page})\n\n`;
      
      pageProducts.forEach((product, index) => {
        const productUrl = product.onlineStoreUrl || `https://${SHOPIFY_STORE_DOMAIN}/products/${product.handle}`;
        markdown += `${startIndex + index + 1}. [${product.title}](${productUrl})\n`;
      });
      
      markdown += `\n`;
    }

    // Navigation links
    markdown += `---\n\n## Quick Navigation\n\n`;
    for (let page = 1; page <= Math.min(totalPages, 10); page++) {
      markdown += `[Page ${page}](/api/products/markdown/${page})`;
      if (page < Math.min(totalPages, 10)) {
        markdown += ` | `;
      }
    }
    if (totalPages > 10) {
      markdown += ` | ... | [Page ${totalPages}](/api/products/markdown/${totalPages})`;
    }
    markdown += `\n\n`;

    // Technical Information
    markdown += `## Technical Information\n\n`;
    markdown += `- **Total Products:** ${totalProductCount}\n`;
    markdown += `- **Products per Page:** ${productsPerPage}\n`;
    markdown += `- **Total Pages:** ${totalPages}\n`;
    markdown += `- **Products Fetched:** ${allProducts.length}\n`;
    markdown += `- **Store Domain:** ${SHOPIFY_STORE_DOMAIN}\n`;
    markdown += `- **Generated:** ${new Date().toISOString()}\n\n`;

    // Set content type to text/plain for markdown
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(markdown);
  } catch (error) {
    console.error("Error generating products pages overview:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to generate products pages overview",
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
          onlineStoreUrl
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
      onlineStoreUrl: product.onlineStoreUrl,
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

    // Get total product count
    const totalProductCount = await getTotalProductCount();

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
    markdown += `**Total Products in Store:** ${totalProductCount}\n\n`;
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
      markdown += `# ${index + 1}. [${product.title}](${product.onlineStoreUrl || `https://${SHOPIFY_STORE_DOMAIN}/products/${product.handle}`})\n\n`;

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
          markdown += `### Variant ${varIndex + 1}: [${v.title}](${product.onlineStoreUrl || `https://${SHOPIFY_STORE_DOMAIN}/products/${product.handle}`})\n\n`;

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

// Function to get total product count
async function getTotalProductCount() {
  const TOTAL_COUNT_QUERY = `
    query getTotalProductCount {
      products(first: 1, query: "status:active") {
        pageInfo {
          hasNextPage
        }
      }
    }
  `;

  try {
    // First, try to get a rough estimate by fetching with a large number
    const ESTIMATE_QUERY = `
      query getProductCountEstimate {
        products(first: 250, query: "status:active") {
          edges {
            node {
              id
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const response = await axios.post(
      STOREFRONT_API_URL,
      {
        query: ESTIMATE_QUERY,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
        },
      }
    );

    if (response.data.errors) {
      console.error("Error fetching product count:", response.data.errors);
      return "Unknown";
    }

    const products = response.data.data.products;
    let totalCount = products.edges.length;

    // If there are more products, we need to paginate to get the exact count
    if (products.pageInfo.hasNextPage) {
      let cursor = products.edges[products.edges.length - 1]?.cursor;
      let hasNextPage = true;

      // Limit iterations to prevent infinite loops
      let iterations = 0;
      const maxIterations = 20; // This would handle up to 5000 products (250 * 20)

      while (hasNextPage && cursor && iterations < maxIterations) {
        const PAGINATED_QUERY = `
          query getPaginatedProducts($after: String!) {
            products(first: 250, after: $after, query: "status:active") {
              edges {
                cursor
                node {
                  id
                }
              }
              pageInfo {
                hasNextPage
              }
            }
          }
        `;

        const paginatedResponse = await axios.post(
          STOREFRONT_API_URL,
          {
            query: PAGINATED_QUERY,
            variables: { after: cursor },
          },
          {
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
            },
          }
        );

        if (paginatedResponse.data.errors) {
          console.error("Error in pagination:", paginatedResponse.data.errors);
          break;
        }

        const paginatedProducts = paginatedResponse.data.data.products;
        totalCount += paginatedProducts.edges.length;
        hasNextPage = paginatedProducts.pageInfo.hasNextPage;
        cursor = paginatedProducts.edges[paginatedProducts.edges.length - 1]?.cursor;
        iterations++;
      }

      // If we hit the max iterations, indicate it's an estimate
      if (iterations >= maxIterations) {
        return `${totalCount}+`;
      }
    }

    return totalCount.toString();
  } catch (error) {
    console.error("Error fetching total product count:", error.message);
    return "Unknown";
  }
}

// API endpoint to get product as markdown
app.get("/api/products/:handle/markdown", async (req, res) => {
  try {
    const { handle } = req.params;

    // Get total product count
    const totalProductCount = await getTotalProductCount();

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
    let markdown = `# [${product.title}](${product.onlineStoreUrl || `https://${SHOPIFY_STORE_DOMAIN}/products/${product.handle}`})\n\n`;
    
    // Add total product count information
    markdown += `**Total Products in Store:** ${totalProductCount}\n\n`;

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
        markdown += `### Variant ${index + 1}: [${v.title}](${product.onlineStoreUrl || `https://${SHOPIFY_STORE_DOMAIN}/products/${product.handle}`})\n\n`;

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

// API endpoint to generate static markdown files
app.get("/api/generate-static", async (req, res) => {
  try {
    const staticDir = path.join(__dirname, "static");
    
    // Create static directory if it doesn't exist
    if (!fs.existsSync(staticDir)) {
      fs.mkdirSync(staticDir, { recursive: true });
    }

    // Get total product count to determine how many pages to generate
    const totalProductCount = await getTotalProductCount();
    const productsPerPage = 5;
    const totalPages = Math.ceil(parseInt(totalProductCount) / productsPerPage);

    let generatedFiles = [];
    let errors = [];

    // Generate static files for each page
    for (let page = 1; page <= totalPages; page++) {
      try {
        // Make internal request to the markdown endpoint
        const response = await axios.get(`http://localhost:${PORT}/api/products/markdown/${page}`);
        
        const filename = `page-${page}.md`;
        const filepath = path.join(staticDir, filename);
        
        // Write the markdown content to file
        fs.writeFileSync(filepath, response.data, 'utf8');
        
        generatedFiles.push({
          page: page,
          filename: filename,
          filepath: filepath,
          size: Buffer.byteLength(response.data, 'utf8')
        });
      } catch (error) {
        errors.push({
          page: page,
          error: error.message
        });
      }
    }

    // Generate overview page with all products
    try {
      const overviewResponse = await axios.get(`http://localhost:${PORT}/api/products/pages`);
      const overviewFilename = 'products-overview.md';
      const overviewFilepath = path.join(staticDir, overviewFilename);
      
      fs.writeFileSync(overviewFilepath, overviewResponse.data, 'utf8');
      
      generatedFiles.push({
        page: 'overview',
        filename: overviewFilename,
        filepath: overviewFilepath,
        size: Buffer.byteLength(overviewResponse.data, 'utf8')
      });
    } catch (error) {
      errors.push({
        page: 'overview',
        error: error.message
      });
    }

    // Generate index file with links to all static files
    const indexContent = `# Static Markdown Files\n\n` +
      `**Generated:** ${new Date().toISOString()}\n\n` +
      `**Total Products:** ${totalProductCount}\n\n` +
      `**Total Pages:** ${totalPages}\n\n` +
      `**Files Generated:** ${generatedFiles.length}\n\n` +
      `---\n\n` +
      `## Available Files\n\n` +
      generatedFiles.map(file => 
        `- [${file.filename}](./static/${file.filename}) (${(file.size / 1024).toFixed(2)} KB)\n`
      ).join('') +
      `\n---\n\n` +
      `## API Endpoints\n\n` +
      `- [Products Overview](/api/products/pages)\n` +
      generatedFiles.filter(f => f.page !== 'overview').map(file => 
        `- [Page ${file.page}](/api/products/markdown/${file.page})\n`
      ).join('');

    const indexFilepath = path.join(staticDir, 'index.md');
    fs.writeFileSync(indexFilepath, indexContent, 'utf8');

    res.json({
      success: true,
      message: "Static markdown files generated successfully",
      data: {
        totalProductCount: totalProductCount,
        totalPages: totalPages,
        staticDirectory: staticDir,
        filesGenerated: generatedFiles.length + 1, // +1 for index file
        files: generatedFiles,
        errors: errors,
        indexFile: 'index.md'
      }
    });
  } catch (error) {
    console.error("Error generating static files:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to generate static files",
      message: error.message,
    });
  }
});

// API endpoint to list all static file URLs for scraping
app.get("/api/static-links", async (req, res) => {
  try {
    const staticDir = path.join(__dirname, "static");
    
    // Check if static directory exists
    if (!fs.existsSync(staticDir)) {
      return res.json({
        success: false,
        message: "Static directory not found. Please generate static files first using /api/generate-static",
        links: []
      });
    }

    // Read all files in static directory
    const files = fs.readdirSync(staticDir).filter(file => file.endsWith('.md'));
    
    // Generate full URLs for each file
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const links = files.map(file => ({
      filename: file,
      url: `${baseUrl}/static/${file}`,
      type: file.includes('page-') ? 'product-page' : 
            file === 'index.md' ? 'index' : 
            file === 'products-overview.md' ? 'overview' : 'other'
    }));

    // Sort links for better organization
    const sortedLinks = links.sort((a, b) => {
      if (a.type === 'index') return -1;
      if (b.type === 'index') return 1;
      if (a.type === 'overview') return -1;
      if (b.type === 'overview') return 1;
      if (a.type === 'product-page' && b.type === 'product-page') {
        const aNum = parseInt(a.filename.match(/page-(\d+)/)?.[1] || '0');
        const bNum = parseInt(b.filename.match(/page-(\d+)/)?.[1] || '0');
        return aNum - bNum;
      }
      return a.filename.localeCompare(b.filename);
    });

    res.json({
      success: true,
      message: "Static file links retrieved successfully",
      totalFiles: files.length,
      baseUrl: baseUrl,
      links: sortedLinks,
      // Also provide just the URLs for easy scraping
      urls: sortedLinks.map(link => link.url)
    });
  } catch (error) {
    console.error("Error listing static files:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to list static files",
      message: error.message,
      links: []
    });
  }
});

// HTML sitemap endpoint for easier scraping
app.get("/sitemap", async (req, res) => {
  try {
    const staticDir = path.join(__dirname, "static");
    
    // Check if static directory exists
    if (!fs.existsSync(staticDir)) {
      return res.send(`
        <html>
          <head><title>Static Files Sitemap</title></head>
          <body>
            <h1>Static Files Sitemap</h1>
            <p>No static files found. Please generate them first using <a href="/api/generate-static">/api/generate-static</a></p>
          </body>
        </html>
      `);
    }

    // Read all files in static directory
    const files = fs.readdirSync(staticDir).filter(file => file.endsWith('.md'));
    
    // Generate full URLs for each file
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const links = files.map(file => ({
      filename: file,
      url: `${baseUrl}/static/${file}`,
      type: file.includes('page-') ? 'product-page' : 
            file === 'index.md' ? 'index' : 
            file === 'products-overview.md' ? 'overview' : 'other'
    }));

    // Sort links for better organization
    const sortedLinks = links.sort((a, b) => {
      if (a.type === 'index') return -1;
      if (b.type === 'index') return 1;
      if (a.type === 'overview') return -1;
      if (b.type === 'overview') return 1;
      if (a.type === 'product-page' && b.type === 'product-page') {
        const aNum = parseInt(a.filename.match(/page-(\d+)/)?.[1] || '0');
        const bNum = parseInt(b.filename.match(/page-(\d+)/)?.[1] || '0');
        return aNum - bNum;
      }
      return a.filename.localeCompare(b.filename);
    });

    // Generate HTML sitemap
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Static Files Sitemap</title>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { color: #333; }
            .stats { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .links { margin: 20px 0; }
            .link-group { margin: 20px 0; }
            .link-group h3 { color: #666; margin-bottom: 10px; }
            a { display: block; padding: 5px 0; color: #0066cc; text-decoration: none; }
            a:hover { text-decoration: underline; }
            .url-list { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .url-list textarea { width: 100%; height: 200px; font-family: monospace; }
          </style>
        </head>
        <body>
          <h1>🗂️ Static Files Sitemap</h1>
          
          <div class="stats">
            <strong>Total Files:</strong> ${files.length}<br>
            <strong>Base URL:</strong> ${baseUrl}<br>
            <strong>Generated:</strong> ${new Date().toISOString()}
          </div>

          <div class="links">
            <div class="link-group">
              <h3>📋 Index & Overview</h3>
              ${sortedLinks.filter(link => link.type === 'index' || link.type === 'overview')
                .map(link => `<a href="${link.url}" target="_blank">${link.filename}</a>`).join('')}
            </div>
            
            <div class="link-group">
              <h3>📄 Product Pages</h3>
              ${sortedLinks.filter(link => link.type === 'product-page')
                .map(link => `<a href="${link.url}" target="_blank">${link.filename}</a>`).join('')}
            </div>
          </div>

          <div class="url-list">
            <h3>📋 All URLs (Copy for Scraping)</h3>
            <textarea readonly onclick="this.select()">${sortedLinks.map(link => link.url).join('\n')}</textarea>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <h3>🔗 API Endpoints</h3>
            <a href="/api/static-links">JSON API - Static Links</a>
            <a href="/api/generate-static">Generate Static Files</a>
            <a href="/">API Documentation</a>
          </div>
        </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error("Error generating sitemap:", error.message);
    res.status(500).send(`
      <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error generating sitemap</h1>
          <p>${error.message}</p>
        </body>
      </html>
    `);
  }
});

// Serve static markdown files
app.use('/static', express.static(path.join(__dirname, 'static')));

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
      "GET /api/products/pages": "Get all products organized by pages with product names as links",
      "GET /api/products/markdown/:page": "Get products for a specific page as markdown",
      "GET /api/products/:handle/markdown": "Get a single product as markdown",
      "GET /api/generate-static": "Generate static markdown files for all products",
      "GET /api/static-links": "Get all static file URLs for scraping",
      "GET /sitemap": "HTML sitemap with all static file links for visual browsing and scraping",
      "GET /static/:filename": "Access generated static markdown files",
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
      "Products pages overview": {
        url: "/api/products/pages",
        method: "GET",
        description: "Shows all products organized by pages with clickable product names",
      },
      "Paginated products markdown": {
        url: "/api/products/markdown/:page",
        method: "GET",
        parameters: {
          page: "Page number (default: 1)",
        },
      },
      "Single product markdown": {
        url: "/api/products/:handle/markdown",
        method: "GET",
        parameters: {
          handle: "Product handle (URL slug)",
        },
      },
      "Static file generation": {
        url: "/api/generate-static",
        method: "GET",
        description: "Generate static markdown files for all products and pages",
      },
      "Static file links": {
        "url": "/api/static-links",
        "method": "GET",
        "description": "Get all static file URLs for easy scraping",
      },
      "HTML sitemap": {
        "url": "/sitemap",
        "method": "GET",
        "description": "Visual HTML sitemap with all static file links for browsing and scraping",
      },
      "Static file access": {
        url: "/static/:filename",
        method: "GET",
        parameters: {
          filename: "Name of the static markdown file to access",
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
