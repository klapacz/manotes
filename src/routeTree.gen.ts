/* prettier-ignore-start */

/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file is auto-generated by TanStack Router

import { createFileRoute } from '@tanstack/react-router'

// Import Routes

import { Route as rootRoute } from './routes/__root'
import { Route as NotesNoteIdImport } from './routes/notes.$noteId'

// Create Virtual Routes

const StudioLazyImport = createFileRoute('/studio')()
const IndexLazyImport = createFileRoute('/')()

// Create/Update Routes

const StudioLazyRoute = StudioLazyImport.update({
  path: '/studio',
  getParentRoute: () => rootRoute,
} as any).lazy(() => import('./routes/studio.lazy').then((d) => d.Route))

const IndexLazyRoute = IndexLazyImport.update({
  path: '/',
  getParentRoute: () => rootRoute,
} as any).lazy(() => import('./routes/index.lazy').then((d) => d.Route))

const NotesNoteIdRoute = NotesNoteIdImport.update({
  path: '/notes/$noteId',
  getParentRoute: () => rootRoute,
} as any)

// Populate the FileRoutesByPath interface

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexLazyImport
      parentRoute: typeof rootRoute
    }
    '/studio': {
      id: '/studio'
      path: '/studio'
      fullPath: '/studio'
      preLoaderRoute: typeof StudioLazyImport
      parentRoute: typeof rootRoute
    }
    '/notes/$noteId': {
      id: '/notes/$noteId'
      path: '/notes/$noteId'
      fullPath: '/notes/$noteId'
      preLoaderRoute: typeof NotesNoteIdImport
      parentRoute: typeof rootRoute
    }
  }
}

// Create and export the route tree

export interface FileRoutesByFullPath {
  '/': typeof IndexLazyRoute
  '/studio': typeof StudioLazyRoute
  '/notes/$noteId': typeof NotesNoteIdRoute
}

export interface FileRoutesByTo {
  '/': typeof IndexLazyRoute
  '/studio': typeof StudioLazyRoute
  '/notes/$noteId': typeof NotesNoteIdRoute
}

export interface FileRoutesById {
  __root__: typeof rootRoute
  '/': typeof IndexLazyRoute
  '/studio': typeof StudioLazyRoute
  '/notes/$noteId': typeof NotesNoteIdRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/studio' | '/notes/$noteId'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/studio' | '/notes/$noteId'
  id: '__root__' | '/' | '/studio' | '/notes/$noteId'
  fileRoutesById: FileRoutesById
}

export interface RootRouteChildren {
  IndexLazyRoute: typeof IndexLazyRoute
  StudioLazyRoute: typeof StudioLazyRoute
  NotesNoteIdRoute: typeof NotesNoteIdRoute
}

const rootRouteChildren: RootRouteChildren = {
  IndexLazyRoute: IndexLazyRoute,
  StudioLazyRoute: StudioLazyRoute,
  NotesNoteIdRoute: NotesNoteIdRoute,
}

export const routeTree = rootRoute
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

/* prettier-ignore-end */

/* ROUTE_MANIFEST_START
{
  "routes": {
    "__root__": {
      "filePath": "__root.tsx",
      "children": [
        "/",
        "/studio",
        "/notes/$noteId"
      ]
    },
    "/": {
      "filePath": "index.lazy.tsx"
    },
    "/studio": {
      "filePath": "studio.lazy.tsx"
    },
    "/notes/$noteId": {
      "filePath": "notes.$noteId.tsx"
    }
  }
}
ROUTE_MANIFEST_END */
