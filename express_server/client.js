// Import required dependencies
var ReconnectingWebSocket = require('reconnecting-websocket');
var sharedb = require('sharedb/lib/client');
var richText = require('rich-text');
var Quill = require('quill/dist/quill.js');
var QuillCursors = require('quill-cursors');
var tinycolor = require('tinycolor2');
require('dotenv').config(); 

sharedb.types.register(richText.type);
Quill.register('modules/cursors', QuillCursors);

document.addEventListener('DOMContentLoaded', function () {
    console.log("Client script loaded!");

    const padId = window.padId;
    const username = window.username || "Anonymous"; 
    const userColor = tinycolor.random().toHexString();

    if (!padId) {
        console.error("Pad ID (window.padId) is not defined.");
        return;
    }

  const socket = new ReconnectingWebSocket(`${process.env.EXPRESS_WS_URL}/?padId=${encodeURIComponent(window.padId)}`);
  const connection = new sharedb.Connection(socket);
  const doc = connection.get('examples', padId);

  doc.subscribe(function (err) {
      if (err) {
          console.error("Error subscribing to document:", err);
          return;
      }
      console.log("Document loaded:", doc.data);
      initializeQuill(doc);
  });

  function initializeQuill(doc) {
    const quill = new Quill('#editor', {
        theme: 'snow',
        modules: {
            toolbar: [
                // Toolbar options
                [{ 'font': [] }, { 'size': ['small', false, 'large', 'huge'] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'align': [] }],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                [{ 'indent': '-1' }, { 'indent': '+1' }],
                [{ 'script': 'sub' }, { 'script': 'super' }],
                ['blockquote', 'code-block'],
                ['link', 'image', 'video'],
                ['clean'],
            ],
            cursors: true, 
        },
        placeholder: 'Start typing...',
    });

    const editorContainer = document.querySelector('#editor');
    const toolbarContainer = document.querySelector('.ql-toolbar');
    const editorContent = document.querySelector('.ql-container');

    toolbarContainer.style.border = 'none';
    toolbarContainer.style.boxShadow = 'none';
    editorContent.style.border = 'none';
    editorContent.style.boxShadow = 'none';
    editorContainer.style.marginBottom = '10px';

    editorContent.style.backgroundColor = 'transparent';
    editorContainer.style.backgroundColor = 'transparent';


    const cursors = quill.getModule('cursors');

    const presence = doc.connection.getDocPresence('examples', padId);
    presence.subscribe(function (error) {
        if (error) console.error("Presence subscription error:", error);
    });

    const localPresence = presence.create(username);

    function updateCursorPosition() {
        const range = quill.getSelection();
        if (range) {
            localPresence.submit({
                range: range,
                name: username,
                color: userColor,
            });
        }
    }

    quill.on('selection-change', function (range, oldRange, source) {
        if (source === 'user') {
            updateCursorPosition();
        }
    });

    quill.on('text-change', function (delta, oldDelta, source) {
        if (source === 'user') {
            updateCursorPosition();
        }
    });

    presence.on('receive', function (id, data) {
        if (!data || id === username) return; 
        cursors.createCursor(id, data.name, data.color);
        cursors.moveCursor(id, data.range);
    });

    quill.setContents(doc.data || { ops: [{ insert: '\n' }] });

    quill.on('text-change', function (delta, oldDelta, source) {
        if (source !== 'user') return;
        doc.submitOp(delta, function (err) {
            if (err) console.error("Error submitting operation:", err);
        });
    });
    
    doc.on('op', function (op, source) {
        if (source) return;
        quill.updateContents(op);
    });

    console.log("Quill editor initialized with real-time cursors and typing synchronization.");
}

});
