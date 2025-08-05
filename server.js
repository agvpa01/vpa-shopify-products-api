const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const TurndownService = require('turndown');
const OpenAI = require('openai');
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

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// Helper function to extract images from HTML content
function extractImagesFromHtml(html) {
  const images = [];
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*(?:alt="([^"]*)")[^>]*>/gi;
  let match;
  
  while ((match = imgRegex.exec(html)) !== null) {
    images.push({
      url: match[1],
      alt: match[2] || '',
      originalTag: match[0]
    });
  }
  
  return images;
}

// Helper function to cleanse content using OpenAI ChatGPT
async function cleanseContentWithChatGPT(content) {
  try {
    if (!content || content.trim().length === 0) {
      return '';
    }

    // Truncate content to fit within token limits (approximately 4 chars per token)
    // Reserve tokens for system message, user prompt, and response
    const maxContentLength = 12000; // ~3000 tokens for content
    const truncatedContent = content.length > maxContentLength 
      ? content.substring(0, maxContentLength) + '...'
      : content;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a content cleaner. Remove all CSS styles, JavaScript code, and HTML tags from the given content. Convert it to clean, readable markdown format. Preserve the actual content, headings, links, and images, but remove all styling and scripts. Keep the content structure and meaning intact."
        },
        {
          role: "user",
          content: `Please clean this content and convert it to simple markdown:\n\n${truncatedContent}`
        }
      ],
      max_tokens: 2000,
      temperature: 0.1
    });

    return response.choices[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error('Error cleansing content with ChatGPT:', error.message);
    // Fallback to basic HTML to markdown conversion
    return turndownService.turndown(content).trim();
  }
}

// Helper function to convert HTML content to markdown with image extraction and AI cleansing
async function processHtmlContent(htmlContent) {
  if (!htmlContent) {
    return {
      markdown: '',
      images: [],
      cleansedMarkdown: ''
    };
  }
  
  // Extract images before conversion
  const images = extractImagesFromHtml(htmlContent);
  
  // Convert HTML to markdown (basic conversion)
  const basicMarkdown = turndownService.turndown(htmlContent);
  
  // Cleanse content using ChatGPT
  const cleansedMarkdown = await cleanseContentWithChatGPT(htmlContent);
  
  return {
    markdown: basicMarkdown.trim(),
    images: images,
    cleansedMarkdown: cleansedMarkdown
  };
}

// GraphQL query to fetch pages
const PAGES_QUERY = `
  query getPages($first: Int!, $after: String) {
    pages(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          body
          bodySummary
          createdAt
          updatedAt
          url
          seo {
            title
            description
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

// GraphQL query to fetch blogs
const BLOGS_QUERY = `
  query getBlogs($first: Int!, $after: String) {
    blogs(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          articles(first: 10) {
            edges {
              node {
                id
                title
                handle
                content
                contentHtml
                excerpt
                publishedAt
                tags
                author: authorV2 {
                  firstName
                  lastName
                }
                seo {
                  title
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

// GraphQL query to fetch single page by handle
const SINGLE_PAGE_QUERY = `
  query getPage($handle: String!) {
    pageByHandle(handle: $handle) {
      id
      title
      handle
      body
      bodySummary
      createdAt
      updatedAt
      url
      seo {
        title
        description
      }
    }
  }
`;

// GraphQL query to fetch single blog by handle
const SINGLE_BLOG_QUERY = `
  query getBlog($handle: String!) {
    blogByHandle(handle: $handle) {
      id
      title
      handle
      articles(first: 50) {
        edges {
          node {
            id
            title
            handle
            content
            contentHtml
            excerpt
            publishedAt
            tags
            author: authorV2 {
              firstName
              lastName
            }
            seo {
              title
              description
            }
          }
        }
      }
    }
  }
`;

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

// Function to get total blog count and article counts
async function getTotalBlogCounts() {
  try {
    let totalBlogs = 0;
    let totalArticles = 0;
    let cursor = null;
    let hasNextPage = true;
    let iterations = 0;
    const maxIterations = 20; // Prevent infinite loops

    while (hasNextPage && iterations < maxIterations) {
      const BLOGS_COUNT_QUERY = `
        query getBlogs($first: Int!, $after: String) {
          blogs(first: $first, after: $after) {
            edges {
              node {
                id
                articles(first: 250) {
                  edges {
                    node {
                      id
                    }
                  }
                }
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
          query: BLOGS_COUNT_QUERY,
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
        throw new Error(JSON.stringify(response.data.errors));
      }

      const blogs = response.data.data.blogs;
      totalBlogs += blogs.edges.length;
      
      // Count articles in each blog
      blogs.edges.forEach(blog => {
        totalArticles += blog.node.articles.edges.length;
      });
      
      hasNextPage = blogs.pageInfo.hasNextPage;
      cursor = blogs.edges.length > 0 ? blogs.edges[blogs.edges.length - 1].cursor : null;
      iterations++;
    }

    return { totalBlogs, totalArticles };
  } catch (error) {
    console.error("Error getting total blog counts:", error.message);
    return { totalBlogs: 0, totalArticles: 0 };
  }
}

// Function to fetch ALL blogs with complete article data
async function getAllBlogsWithArticles() {
  try {
    let allBlogs = [];
    let cursor = null;
    let hasNextPage = true;
    let iterations = 0;
    const maxIterations = 20; // Prevent infinite loops

    while (hasNextPage && iterations < maxIterations) {
      const ALL_BLOGS_QUERY = `
        query getAllBlogs($first: Int!, $after: String) {
          blogs(first: $first, after: $after) {
            edges {
              node {
                id
                title
                handle
                seo {
                  title
                  description
                }
                articles(first: 250) {
                  edges {
                    node {
                      id
                      title
                      handle
                      contentHtml
                      excerpt
                      publishedAt
                      tags
                      author {
                        firstName
                        lastName
                      }
                      seo {
                        title
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
            }
          }
        }
      `;

      const variables = {
        first: 50, // Smaller batch size due to article content
        ...(cursor && { after: cursor }),
      };

      const response = await axios.post(
        STOREFRONT_API_URL,
        {
          query: ALL_BLOGS_QUERY,
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
        throw new Error(JSON.stringify(response.data.errors));
      }

      const blogs = response.data.data.blogs;
      
      // Process each blog and its articles
      for (const blogEdge of blogs.edges) {
        const blog = blogEdge.node;
        
        // Process articles with cleansed content
        const processedArticles = await Promise.all(
          blog.articles.edges.map(async (articleEdge) => {
            const article = articleEdge.node;
            const processedContent = await processHtmlContent(article.contentHtml);
            const processedExcerpt = await processHtmlContent(article.excerpt);
            
            return {
              ...article,
              content: processedContent.cleansedMarkdown || processedContent.markdown,
              contentHtml: article.contentHtml,
              contentMarkdown: processedContent.markdown,
              contentCleansed: processedContent.cleansedMarkdown,
              excerpt: processedExcerpt.cleansedMarkdown || processedExcerpt.markdown,
              excerptHtml: article.excerpt,
              excerptMarkdown: processedExcerpt.markdown,
              excerptCleansed: processedExcerpt.cleansedMarkdown,
              images: processedContent.images,
              excerptImages: processedExcerpt.images
            };
          })
        );
        
        allBlogs.push({
          ...blog,
          articles: processedArticles,
          articleCount: processedArticles.length
        });
      }
      
      hasNextPage = blogs.pageInfo.hasNextPage;
      cursor = blogs.edges.length > 0 ? blogs.edges[blogs.edges.length - 1].cursor : null;
      iterations++;
    }

    return allBlogs;
  } catch (error) {
    console.error("Error fetching all blogs with articles:", error.message);
    throw error;
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

// API endpoint to get all pages
app.get("/api/pages", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 250);
    const cursor = req.query.cursor || null;

    const variables = {
      first: limit,
      ...(cursor && { after: cursor }),
    };

    const response = await axios.post(
      STOREFRONT_API_URL,
      {
        query: PAGES_QUERY,
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

    const pages = response.data.data.pages;
    const formattedPages = pages.edges.map((edge) => ({
      ...edge.node,
      cursor: edge.cursor,
    }));

    res.json({
      success: true,
      data: formattedPages,
      pageInfo: pages.pageInfo,
      pagination: {
        hasNextPage: pages.pageInfo.hasNextPage,
        hasPreviousPage: pages.pageInfo.hasPreviousPage,
        nextCursor: pages.edges.length > 0 ? pages.edges[pages.edges.length - 1].cursor : null,
      },
    });
  } catch (error) {
    console.error("Error fetching pages:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch pages",
      message: error.message,
    });
  }
});

// API endpoint to get a single page by handle
app.get("/api/pages/:handle", async (req, res) => {
  try {
    const { handle } = req.params;

    const response = await axios.post(
      STOREFRONT_API_URL,
      {
        query: SINGLE_PAGE_QUERY,
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

    const page = response.data.data.pageByHandle;

    if (!page) {
      return res.status(404).json({
        success: false,
        error: "Page not found",
      });
    }

    res.json({
      success: true,
      data: page,
    });
  } catch (error) {
    console.error("Error fetching page:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch page",
      message: error.message,
    });
  }
});

// API endpoint to get blogs
app.get("/api/blogs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 250);
    const cursor = req.query.cursor || null;

    // Get total counts
    const { totalBlogs, totalArticles } = await getTotalBlogCounts();

    const variables = {
      first: limit,
      ...(cursor && { after: cursor }),
    };

    const response = await axios.post(
      STOREFRONT_API_URL,
      {
        query: BLOGS_QUERY,
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

    const blogs = response.data.data.blogs;
    const formattedBlogs = await Promise.all(blogs.edges.map(async (edge) => ({
      ...edge.node,
      cursor: edge.cursor,
      articleCount: edge.node.articles.edges.length,
      articles: await Promise.all(edge.node.articles.edges.map(async (article) => {
        const processedContent = await processHtmlContent(article.node.contentHtml);
        const processedExcerpt = await processHtmlContent(article.node.excerpt);
        
        return {
          ...article.node,
          content: processedContent.cleansedMarkdown || processedContent.markdown,
          contentHtml: article.node.contentHtml, // Keep original HTML
          contentMarkdown: processedContent.markdown,
          contentCleansed: processedContent.cleansedMarkdown,
          excerpt: processedExcerpt.cleansedMarkdown || processedExcerpt.markdown,
          excerptHtml: article.node.excerpt, // Keep original HTML
          excerptMarkdown: processedExcerpt.markdown,
          excerptCleansed: processedExcerpt.cleansedMarkdown,
          images: processedContent.images,
          excerptImages: processedExcerpt.images
        };
      })),
    })));

    res.json({
      success: true,
      data: formattedBlogs,
      totalCounts: {
        totalBlogs,
        totalArticles,
        currentPageBlogs: formattedBlogs.length,
        currentPageArticles: formattedBlogs.reduce((sum, blog) => sum + blog.articleCount, 0)
      },
      pageInfo: blogs.pageInfo,
      pagination: {
        hasNextPage: blogs.pageInfo.hasNextPage,
        hasPreviousPage: blogs.pageInfo.hasPreviousPage,
        nextCursor: blogs.edges.length > 0 ? blogs.edges[blogs.edges.length - 1].cursor : null,
      },
    });
  } catch (error) {
    console.error("Error fetching blogs:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch blogs",
      message: error.message,
    });
  }
});

// API endpoint to get a single blog by handle
app.get("/api/blogs/:handle", async (req, res) => {
  try {
    const { handle } = req.params;

    const response = await axios.post(
      STOREFRONT_API_URL,
      {
        query: SINGLE_BLOG_QUERY,
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

    const blog = response.data.data.blogByHandle;

    if (!blog) {
      return res.status(404).json({
        success: false,
        error: "Blog not found",
      });
    }

    const formattedBlog = {
      ...blog,
      articleCount: blog.articles.edges.length,
      articles: await Promise.all(blog.articles.edges.map(async (article) => {
        const processedContent = await processHtmlContent(article.node.contentHtml);
        const processedExcerpt = await processHtmlContent(article.node.excerpt);
        
        return {
          ...article.node,
          content: processedContent.cleansedMarkdown || processedContent.markdown,
          contentHtml: article.node.contentHtml, // Keep original HTML
          contentMarkdown: processedContent.markdown,
          contentCleansed: processedContent.cleansedMarkdown,
          excerpt: processedExcerpt.cleansedMarkdown || processedExcerpt.markdown,
          excerptHtml: article.node.excerpt, // Keep original HTML
          excerptMarkdown: processedExcerpt.markdown,
          excerptCleansed: processedExcerpt.cleansedMarkdown,
          images: processedContent.images,
          excerptImages: processedExcerpt.images
        };
      })),
    };

    res.json({
      success: true,
      data: formattedBlog,
    });
  } catch (error) {
    console.error("Error fetching blog:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch blog",
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

// API endpoint to generate static markdown files for blogs with cleansed content
app.get("/api/generate-blog-static", async (req, res) => {
  try {
    const blogStaticDir = path.join(__dirname, "blog-static");
    const consolidateShort = req.query.consolidate === 'true'; // Option to consolidate short articles
    const shortArticleThreshold = parseInt(req.query.threshold) || 3000; // Default 3KB threshold
    
    // Create blog-static directory if it doesn't exist
    if (!fs.existsSync(blogStaticDir)) {
      fs.mkdirSync(blogStaticDir, { recursive: true });
    }

    // Fetch ALL blogs with complete article data directly from Shopify
    console.log("Fetching all blogs and articles from Shopify...");
    const blogs = await getAllBlogsWithArticles();
    console.log(`Fetched ${blogs.length} blogs with ${blogs.reduce((sum, blog) => sum + blog.articleCount, 0)} total articles`);

    let generatedFiles = [];
    let errors = [];
    let consolidationStats = {
      totalArticles: 0,
      shortArticles: 0,
      consolidatedFiles: 0,
      individualFiles: 0
    };

    // Generate static files for each blog
    for (const blog of blogs) {
      try {
        // Create blog directory
        const blogDir = path.join(blogStaticDir, blog.handle);
        if (!fs.existsSync(blogDir)) {
          fs.mkdirSync(blogDir, { recursive: true });
        }

        // Analyze articles and separate short from long ones
        const articlesWithSizes = blog.articles.map(article => {
          const articleContent = `# ${article.title}\n\n` +
            `**Handle:** ${article.handle}\n\n` +
            `**Published:** ${article.publishedAt}\n\n` +
            `**Author:** ${article.author?.firstName || ''} ${article.author?.lastName || ''}\n\n` +
            `**Tags:** ${article.tags.join(', ')}\n\n` +
            `**SEO Title:** ${article.seo?.title || 'N/A'}\n\n` +
            `**SEO Description:** ${article.seo?.description || 'N/A'}\n\n` +
            `---\n\n` +
            `## Excerpt\n\n` +
            `${article.excerptCleansed || article.excerptMarkdown || 'No excerpt available'}\n\n` +
            `---\n\n` +
            `## Content\n\n` +
            `${article.contentCleansed || article.contentMarkdown || 'No content available'}\n\n` +
            (article.images && article.images.length > 0 ? 
              `---\n\n## Images\n\n` +
              article.images.map(img => `![Image](${img.src})\n\n`).join('') : '');
          
          return {
            ...article,
            content: articleContent,
            size: Buffer.byteLength(articleContent, 'utf8')
          };
        });

        consolidationStats.totalArticles += articlesWithSizes.length;
        
        const shortArticles = articlesWithSizes.filter(article => article.size < shortArticleThreshold);
        const longArticles = articlesWithSizes.filter(article => article.size >= shortArticleThreshold);
        
        consolidationStats.shortArticles += shortArticles.length;

        // Generate blog overview file with enhanced metadata
        const blogOverviewContent = `# ${blog.title}\n\n` +
          `**Handle:** ${blog.handle}\n\n` +
          `**Total Articles:** ${blog.articles.length}\n\n` +
          `**Short Articles:** ${shortArticles.length} (< ${(shortArticleThreshold/1024).toFixed(1)}KB)\n\n` +
          `**Long Articles:** ${longArticles.length} (>= ${(shortArticleThreshold/1024).toFixed(1)}KB)\n\n` +
          `**Consolidation:** ${consolidateShort ? 'Enabled' : 'Disabled'}\n\n` +
          `**Generated:** ${new Date().toISOString()}\n\n` +
          `---\n\n` +
          `## Articles Overview\n\n` +
          articlesWithSizes.map(article => {
            const fileRef = consolidateShort && article.size < shortArticleThreshold ? 
              `./short-articles-combined.md#${article.handle}` : `./${article.handle}.md`;
            return `### [${article.title}](${fileRef})\n\n` +
              `**Handle:** ${article.handle}\n\n` +
              `**Published:** ${article.publishedAt}\n\n` +
              `**Author:** ${article.author?.firstName || ''} ${article.author?.lastName || ''}\n\n` +
              `**Tags:** ${article.tags.join(', ')}\n\n` +
              `**Size:** ${(article.size / 1024).toFixed(2)} KB\n\n` +
              `**Type:** ${article.size < shortArticleThreshold ? 'Short' : 'Long'}\n\n` +
              `**Excerpt:** ${article.excerptCleansed || article.excerptMarkdown || 'No excerpt available'}\n\n` +
              `---\n\n`;
          }).join('');

        const blogOverviewFilename = `${blog.handle}-overview.md`;
        const blogOverviewFilepath = path.join(blogDir, blogOverviewFilename);
        fs.writeFileSync(blogOverviewFilepath, blogOverviewContent, 'utf8');

        generatedFiles.push({
          blog: blog.handle,
          type: 'overview',
          filename: blogOverviewFilename,
          filepath: blogOverviewFilepath,
          size: Buffer.byteLength(blogOverviewContent, 'utf8')
        });

        // Handle short articles consolidation
        if (consolidateShort && shortArticles.length > 0) {
          const combinedContent = `# ${blog.title} - Short Articles Collection\n\n` +
            `**Blog Handle:** ${blog.handle}\n\n` +
            `**Total Short Articles:** ${shortArticles.length}\n\n` +
            `**Threshold:** < ${(shortArticleThreshold/1024).toFixed(1)}KB\n\n` +
            `**Generated:** ${new Date().toISOString()}\n\n` +
            `---\n\n` +
            `## Table of Contents\n\n` +
            shortArticles.map((article, index) => 
              `${index + 1}. [${article.title}](#${article.handle}) - ${(article.size / 1024).toFixed(2)}KB\n`
            ).join('') +
            `\n---\n\n` +
            shortArticles.map(article => 
              `<a id="${article.handle}"></a>\n\n` +
              `${article.content}\n\n` +
              `---\n\n` +
              `**Article Metadata:**\n\n` +
              `- **Handle:** ${article.handle}\n` +
              `- **Published:** ${article.publishedAt}\n` +
              `- **Author:** ${article.author?.firstName || ''} ${article.author?.lastName || ''}\n` +
              `- **Tags:** ${article.tags.join(', ')}\n` +
              `- **Size:** ${(article.size / 1024).toFixed(2)} KB\n` +
              `- **SEO Title:** ${article.seo?.title || 'N/A'}\n` +
              `- **SEO Description:** ${article.seo?.description || 'N/A'}\n\n` +
              `---\n\n`
            ).join('');

          const combinedFilename = 'short-articles-combined.md';
          const combinedFilepath = path.join(blogDir, combinedFilename);
          fs.writeFileSync(combinedFilepath, combinedContent, 'utf8');

          generatedFiles.push({
            blog: blog.handle,
            type: 'combined-short',
            filename: combinedFilename,
            filepath: combinedFilepath,
            size: Buffer.byteLength(combinedContent, 'utf8'),
            articlesCount: shortArticles.length,
            articleTitles: shortArticles.map(a => a.title)
          });
          
          consolidationStats.consolidatedFiles++;
        } else if (!consolidateShort) {
          // Generate individual files for short articles when consolidation is disabled
          for (const article of shortArticles) {
            const articleFilename = `${article.handle}.md`;
            const articleFilepath = path.join(blogDir, articleFilename);
            fs.writeFileSync(articleFilepath, article.content, 'utf8');

            generatedFiles.push({
              blog: blog.handle,
              type: 'article-short',
              filename: articleFilename,
              filepath: articleFilepath,
              size: article.size,
              articleTitle: article.title
            });
            
            consolidationStats.individualFiles++;
          }
        }

        // Generate individual files for long articles
        for (const article of longArticles) {
          const articleFilename = `${article.handle}.md`;
          const articleFilepath = path.join(blogDir, articleFilename);
          fs.writeFileSync(articleFilepath, article.content, 'utf8');

          generatedFiles.push({
            blog: blog.handle,
            type: 'article-long',
            filename: articleFilename,
            filepath: articleFilepath,
            size: article.size,
            articleTitle: article.title
          });
          
          consolidationStats.individualFiles++;
        }
      } catch (error) {
        errors.push({
          blog: blog.handle,
          error: error.message
        });
      }
    }

    // Generate master index file with consolidation information
    const masterIndexContent = `# Blog Static Files\n\n` +
      `**Generated:** ${new Date().toISOString()}\n\n` +
      `**Total Blogs:** ${blogs.length}\n\n` +
      `**Total Articles:** ${consolidationStats.totalArticles}\n\n` +
      `**Short Articles:** ${consolidationStats.shortArticles} (< ${(shortArticleThreshold/1024).toFixed(1)}KB)\n\n` +
      `**Consolidation Mode:** ${consolidateShort ? 'Enabled' : 'Disabled'}\n\n` +
      `**Total Files Generated:** ${generatedFiles.length + 1}\n\n` +
      `**Consolidated Files:** ${consolidationStats.consolidatedFiles}\n\n` +
      `**Individual Files:** ${consolidationStats.individualFiles}\n\n` +
      `---\n\n` +
      `## Blogs Overview\n\n` +
      blogs.map(blog => {
        const blogFiles = generatedFiles.filter(f => f.blog === blog.handle);
        const shortArticleFiles = blogFiles.filter(f => f.type === 'article-short' || f.type === 'combined-short');
        const longArticleFiles = blogFiles.filter(f => f.type === 'article-long');
        const combinedFile = blogFiles.find(f => f.type === 'combined-short');
        
        return `### [${blog.title}](./${blog.handle}/${blog.handle}-overview.md)\n\n` +
               `**Handle:** ${blog.handle}\n\n` +
               `**Total Articles:** ${blog.articleCount}\n\n` +
               `**Short Articles:** ${combinedFile ? combinedFile.articlesCount : shortArticleFiles.length}\n\n` +
               `**Long Articles:** ${longArticleFiles.length}\n\n` +
               `**Files Generated:** ${blogFiles.length}\n\n` +
               `**Consolidation:** ${combinedFile ? 'Yes (Combined)' : 'No (Individual)'}\n\n`;
      }).join('\n') +
      `\n---\n\n` +
      `## File Structure\n\n` +
      blogs.map(blog => {
        const blogFiles = generatedFiles.filter(f => f.blog === blog.handle);
        return `### ${blog.title} (${blog.handle})\n\n` +
               blogFiles.map(file => {
                 let description = '';
                 if (file.type === 'overview') description = ' - Blog Overview';
                 else if (file.type === 'combined-short') description = ` - Combined Short Articles (${file.articlesCount} articles)`;
                 else if (file.type === 'article-short') description = ` - ${file.articleTitle} (Short)`;
                 else if (file.type === 'article-long') description = ` - ${file.articleTitle} (Long)`;
                 
                 return `- [${file.filename}](./${file.blog}/${file.filename}) (${(file.size / 1024).toFixed(2)} KB)${description}\n`;
               }).join('') + '\n';
      }).join('') +
      `---\n\n` +
      `## Consolidation Statistics\n\n` +
      `- **Total Articles Processed:** ${consolidationStats.totalArticles}\n` +
      `- **Short Articles (< ${(shortArticleThreshold/1024).toFixed(1)}KB):** ${consolidationStats.shortArticles}\n` +
      `- **Long Articles (>= ${(shortArticleThreshold/1024).toFixed(1)}KB):** ${consolidationStats.totalArticles - consolidationStats.shortArticles}\n` +
      `- **Consolidated Files Created:** ${consolidationStats.consolidatedFiles}\n` +
      `- **Individual Files Created:** ${consolidationStats.individualFiles}\n` +
      `- **Total Files Generated:** ${generatedFiles.length + 1} (including this index)\n\n` +
      `---\n\n` +
      `## Usage Instructions\n\n` +
      `### Accessing Articles\n\n` +
      `1. **Individual Articles:** Click on article links in blog overviews\n` +
      `2. **Combined Short Articles:** Use the table of contents in combined files\n` +
      `3. **Direct Links:** Use anchor links (#article-handle) for combined articles\n\n` +
      `### API Parameters\n\n` +
      `- \`?consolidate=true\` - Enable short article consolidation\n` +
      `- \`?threshold=3000\` - Set size threshold in bytes (default: 3000)\n\n`;

    const masterIndexFilepath = path.join(blogStaticDir, 'index.md');
    fs.writeFileSync(masterIndexFilepath, masterIndexContent, 'utf8');

    const totalArticles = blogs.reduce((sum, blog) => sum + blog.articleCount, 0);
    
    res.json({
      success: true,
      message: `Blog static markdown files generated successfully ${consolidateShort ? 'with short article consolidation' : 'with individual files'}`,
      consolidationEnabled: consolidateShort,
      shortArticleThreshold: shortArticleThreshold,
      totalBlogsProcessed: blogs.length,
      totalArticlesProcessed: totalArticles,
      totalFilesGenerated: generatedFiles.length + 1, // +1 for master index
      directory: blogStaticDir,
      consolidationStats: consolidationStats,
      data: {
        totalBlogs: blogs.length,
        totalArticles: totalArticles,
        staticDirectory: blogStaticDir,
        filesGenerated: generatedFiles.length + 1,
        files: generatedFiles,
        errors: errors,
        masterIndexFile: 'index.md',
        consolidationMode: consolidateShort ? 'enabled' : 'disabled',
        threshold: `${(shortArticleThreshold/1024).toFixed(1)}KB`
      },
      details: blogs.map(blog => {
        const blogFiles = generatedFiles.filter(f => f.blog === blog.handle);
        const combinedFile = blogFiles.find(f => f.type === 'combined-short');
        const shortFiles = blogFiles.filter(f => f.type === 'article-short');
        const longFiles = blogFiles.filter(f => f.type === 'article-long');
        
        return {
          category: blog.title,
          handle: blog.handle,
          articlesProcessed: blog.articleCount,
          filesGenerated: blogFiles.length,
          shortArticles: combinedFile ? combinedFile.articlesCount : shortFiles.length,
          longArticles: longFiles.length,
          consolidatedFile: combinedFile ? combinedFile.filename : null,
          consolidationEnabled: !!combinedFile
        };
      })
    });
  } catch (error) {
    console.error("Error generating blog static files:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to generate blog static files",
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

// API endpoint to list all blog static file URLs for scraping
app.get("/api/blog-static-links", async (req, res) => {
  try {
    const blogStaticDir = path.join(__dirname, "blog-static");
    
    // Check if blog-static directory exists
    if (!fs.existsSync(blogStaticDir)) {
      return res.json({
        success: false,
        message: "Blog static directory not found. Please generate blog static files first using /api/generate-blog-static",
        links: []
      });
    }

    // Read all directories and files in blog-static directory
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    let links = [];

    // Add master index file
    const masterIndexPath = path.join(blogStaticDir, 'index.md');
    if (fs.existsSync(masterIndexPath)) {
      links.push({
        filename: 'index.md',
        url: `${baseUrl}/blog-static/index.md`,
        type: 'master-index',
        blog: null
      });
    }

    // Read blog directories
    const blogDirs = fs.readdirSync(blogStaticDir).filter(item => {
      const itemPath = path.join(blogStaticDir, item);
      return fs.statSync(itemPath).isDirectory();
    });

    for (const blogDir of blogDirs) {
      const blogPath = path.join(blogStaticDir, blogDir);
      const files = fs.readdirSync(blogPath).filter(file => file.endsWith('.md'));
      
      for (const file of files) {
        links.push({
          filename: file,
          url: `${baseUrl}/blog-static/${blogDir}/${file}`,
          type: file.includes('-overview.md') ? 'blog-overview' : 'article',
          blog: blogDir
        });
      }
    }

    // Sort links for better organization
    const sortedLinks = links.sort((a, b) => {
      if (a.type === 'master-index') return -1;
      if (b.type === 'master-index') return 1;
      if (a.type === 'blog-overview' && b.type === 'article') return -1;
      if (a.type === 'article' && b.type === 'blog-overview') return 1;
      if (a.blog !== b.blog) return (a.blog || '').localeCompare(b.blog || '');
      return a.filename.localeCompare(b.filename);
    });

    res.json({
      success: true,
      message: "Blog static file links retrieved successfully",
      totalFiles: links.length,
      baseUrl: baseUrl,
      links: sortedLinks,
      // Also provide just the URLs for easy scraping
      urls: sortedLinks.map(link => link.url)
    });
  } catch (error) {
    console.error("Error listing blog static files:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to list blog static files",
      message: error.message,
      links: []
    });
  }
});

// HTML blog sitemap endpoint for easier scraping
app.get("/blog-sitemap", async (req, res) => {
  try {
    const blogStaticDir = path.join(__dirname, "blog-static");
    
    // Check if blog-static directory exists
    if (!fs.existsSync(blogStaticDir)) {
      return res.send(`
        <html>
          <head><title>Blog Static Files Sitemap</title></head>
          <body>
            <h1>Blog Static Files Sitemap</h1>
            <p>No blog static files found. Please generate them first using <a href="/api/generate-blog-static">/api/generate-blog-static</a></p>
          </body>
        </html>
      `);
    }

    // Read all directories and files in blog-static directory
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    let links = [];

    // Add master index file
    const masterIndexPath = path.join(blogStaticDir, 'index.md');
    if (fs.existsSync(masterIndexPath)) {
      links.push({
        filename: 'index.md',
        url: `${baseUrl}/blog-static/index.md`,
        type: 'master-index',
        blog: null
      });
    }

    // Read blog directories
    const blogDirs = fs.readdirSync(blogStaticDir).filter(item => {
      const itemPath = path.join(blogStaticDir, item);
      return fs.statSync(itemPath).isDirectory();
    });

    for (const blogDir of blogDirs) {
      const blogPath = path.join(blogStaticDir, blogDir);
      const files = fs.readdirSync(blogPath).filter(file => file.endsWith('.md'));
      
      for (const file of files) {
        links.push({
          filename: file,
          url: `${baseUrl}/blog-static/${blogDir}/${file}`,
          type: file.includes('-overview.md') ? 'blog-overview' : 'article',
          blog: blogDir
        });
      }
    }

    // Sort links for better organization
    const sortedLinks = links.sort((a, b) => {
      if (a.type === 'master-index') return -1;
      if (b.type === 'master-index') return 1;
      if (a.type === 'blog-overview' && b.type === 'article') return -1;
      if (a.type === 'article' && b.type === 'blog-overview') return 1;
      if (a.blog !== b.blog) return (a.blog || '').localeCompare(b.blog || '');
      return a.filename.localeCompare(b.filename);
    });

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Blog Static Files Sitemap</title>
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
          <h1>📝 Blog Static Files Sitemap</h1>
          
          <div class="stats">
            <strong>Total Files:</strong> ${links.length}<br>
            <strong>Base URL:</strong> ${baseUrl}<br>
            <strong>Generated:</strong> ${new Date().toISOString()}
          </div>

          <div class="links">
            <div class="link-group">
              <h3>📋 Master Index</h3>
              ${sortedLinks.filter(link => link.type === 'master-index')
                .map(link => `<a href="${link.url}" target="_blank">${link.filename}</a>`).join('')}
            </div>
            
            <div class="link-group">
              <h3>📚 Blog Overviews</h3>
              ${sortedLinks.filter(link => link.type === 'blog-overview')
                .map(link => `<a href="${link.url}" target="_blank">${link.blog}/${link.filename}</a>`).join('')}
            </div>
            
            <div class="link-group">
              <h3>📄 Articles</h3>
              ${sortedLinks.filter(link => link.type === 'article')
                .map(link => `<a href="${link.url}" target="_blank">${link.blog}/${link.filename}</a>`).join('')}
            </div>
          </div>

          <div class="url-list">
            <h3>📋 All URLs (Copy for Scraping)</h3>
            <textarea readonly onclick="this.select()">${sortedLinks.map(link => link.url).join('\n')}</textarea>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <h3>🔗 API Endpoints</h3>
            <a href="/api/blog-static-links">JSON API - Blog Static Links</a>
            <a href="/api/generate-blog-static">Generate Blog Static Files</a>
            <a href="/">API Documentation</a>
          </div>
        </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error("Error generating blog sitemap:", error.message);
    res.status(500).send(`
      <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error generating blog sitemap</h1>
          <p>${error.message}</p>
        </body>
      </html>
    `);
  }
});

// Serve static markdown files
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use('/blog-static', express.static(path.join(__dirname, 'blog-static')));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Root endpoint with API documentation
app.get("/", (req, res) => {
  res.json({
    message: "Shopify Product & Pages API",
    version: "1.0.0",
    endpoints: {
      "GET /api/products":
        "Get all products (supports ?limit=10&cursor=xyz for pagination)",
      "GET /api/products/:handle": "Get a single product by handle",
      "GET /api/products/pages": "Get all products organized by pages with product names as links",
      "GET /api/products/markdown/:page": "Get products for a specific page as markdown",
      "GET /api/products/:handle/markdown": "Get a single product as markdown",
      "GET /api/pages": "Get all pages (supports ?limit=10&cursor=xyz for pagination)",
      "GET /api/pages/:handle": "Get a single page by handle",
      "GET /api/blogs": "Get all blogs with articles (supports ?limit=10&cursor=xyz for pagination)",
      "GET /api/blogs/:handle": "Get a single blog with articles by handle",
      "GET /api/generate-static": "Generate static markdown files for all products",
      "GET /api/generate-blog-static": "Generate static markdown files for all blogs with cleansed content",
      "GET /api/static-links": "Get all static file URLs for scraping",
      "GET /api/blog-static-links": "Get all blog static file URLs for scraping",
      "GET /sitemap": "HTML sitemap with all static file links for visual browsing and scraping",
      "GET /blog-sitemap": "HTML sitemap with all blog static file links for visual browsing and scraping",
      "GET /static/:filename": "Access generated static markdown files",
      "GET /blog-static/*": "Access generated blog static markdown files",
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
      "Pages endpoint": {
        url: "/api/pages",
        method: "GET",
        parameters: {
          limit: "Number of pages to fetch (max 250, default 10)",
          cursor: "Pagination cursor for next page",
        },
      },
      "Single page endpoint": {
        url: "/api/pages/:handle",
        method: "GET",
        parameters: {
          handle: "Page handle (URL slug)",
        },
      },
      "Blogs endpoint": {
        url: "/api/blogs",
        method: "GET",
        parameters: {
          limit: "Number of blogs to fetch (max 250, default 10)",
          cursor: "Pagination cursor for next page",
        },
      },
      "Single blog endpoint": {
        url: "/api/blogs/:handle",
        method: "GET",
        parameters: {
          handle: "Blog handle (URL slug)",
        },
      },
      "Static file generation": {
        url: "/api/generate-static",
        method: "GET",
        description: "Generate static markdown files for all products and pages",
      },
      "Blog static file generation": {
        url: "/api/generate-blog-static",
        method: "GET",
        description: "Generate static markdown files for all blogs with ChatGPT-cleansed content",
      },
      "Static file links": {
        "url": "/api/static-links",
        "method": "GET",
        "description": "Get all static file URLs for easy scraping",
      },
      "Blog static file links": {
        "url": "/api/blog-static-links",
        "method": "GET",
        "description": "Get all blog static file URLs for easy scraping",
      },
      "HTML sitemap": {
        "url": "/sitemap",
        "method": "GET",
        "description": "Visual HTML sitemap with all static file links for browsing and scraping",
      },
      "Blog HTML sitemap": {
        "url": "/blog-sitemap",
        "method": "GET",
        "description": "Visual HTML sitemap with all blog static file links for browsing and scraping",
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
