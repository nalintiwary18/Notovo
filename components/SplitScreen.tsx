'use client'

import 'react-split-pane/styles.css';
import { useState } from "react";
import { SplitPane, Pane } from "react-split-pane";
import DocRender from "@/components/DocRender";
import Chat from "@/components/ChatSection"


export interface Block {
    id: string;
    type: 'paragraph';
    content: string;
}

export default function SplitScreen() {
    const [documentBlocks, setDocumentBlocks] = useState<Block[]>([]);
    return (
        <div className="h-screen w-screen overflow-hidden">
            <SplitPane direction="horizontal" className="!h-full">
                <Pane minSize="30%" defaultSize="40%" >
                    <div className="h-full overflow-y-auto scrollbar-hide bg-gray-800 right-2">
                        <Chat setDocumentBlocks={setDocumentBlocks} documentBlocks={documentBlocks} />
                    </div>
                </Pane>
                <Pane>
                    <div className="h-full overflow-y-auto scrollbar-hide bg-gray-800 ">
                        <DocRender documentBlocks={documentBlocks} setDocumentBlocks={setDocumentBlocks} />
                    </div>
                </Pane>
            </SplitPane>
        </div>
    );
}