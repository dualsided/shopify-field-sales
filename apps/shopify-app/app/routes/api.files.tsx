/**
 * Files API Route
 *
 * Handles listing and uploading files to Shopify Files.
 *
 * GET: List files with optional search and pagination
 * POST: Staged upload flow for new files
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const STAGED_UPLOADS_CREATE = `#graphql
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_CREATE = `#graphql
  mutation fileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        ... on MediaImage {
          id
          alt
          image {
            url
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILES_QUERY = `#graphql
  query getFiles($first: Int!, $after: String, $query: String) {
    files(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          ... on MediaImage {
            id
            alt
            image {
              url
              width
              height
            }
            createdAt
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const after = url.searchParams.get("after") || null;
  const search = url.searchParams.get("search") || "";

  // Build query to filter for images only
  let query = "media_type:IMAGE";
  if (search) {
    query += ` AND filename:*${search}*`;
  }

  const response = await admin.graphql(FILES_QUERY, {
    variables: {
      first: 24,
      after,
      query,
    },
  });

  const data = await response.json();

  const files = data.data.files.edges
    .map((edge: any) => ({
      id: edge.node.id,
      url: edge.node.image?.url,
      alt: edge.node.alt,
      width: edge.node.image?.width,
      height: edge.node.image?.height,
      cursor: edge.cursor,
    }))
    .filter((file: any) => file.url); // Filter out any without URLs

  return {
    files,
    pageInfo: data.data.files.pageInfo,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "stagedUpload") {
    const filename = formData.get("filename") as string;
    const mimeType = formData.get("mimeType") as string;
    const fileSize = formData.get("fileSize") as string;

    const response = await admin.graphql(STAGED_UPLOADS_CREATE, {
      variables: {
        input: [
          {
            filename,
            mimeType,
            fileSize,
            httpMethod: "POST",
            resource: "FILE",
          },
        ],
      },
    });

    const data = await response.json();

    if (data.data.stagedUploadsCreate.userErrors.length > 0) {
      return {
        error: data.data.stagedUploadsCreate.userErrors[0].message,
      };
    }

    return {
      stagedTarget: data.data.stagedUploadsCreate.stagedTargets[0],
    };
  }

  if (intent === "fileCreate") {
    const resourceUrl = formData.get("resourceUrl") as string;
    const alt = formData.get("alt") as string || "";

    const response = await admin.graphql(FILE_CREATE, {
      variables: {
        files: [
          {
            alt,
            contentType: "IMAGE",
            originalSource: resourceUrl,
          },
        ],
      },
    });

    const data = await response.json();

    if (data.data.fileCreate.userErrors.length > 0) {
      return {
        error: data.data.fileCreate.userErrors[0].message,
      };
    }

    return {
      success: true,
      file: data.data.fileCreate.files[0],
    };
  }

  return { error: "Unknown intent" };
};
