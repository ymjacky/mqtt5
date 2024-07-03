import { serve } from 'std/http/mod.ts';
import { serveDir } from 'std/http/file_server.ts';
serve((request) => serveDir(request));
