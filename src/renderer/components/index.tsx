import React, { useState } from 'react';
import { connect } from 'react-redux';
import Workspace from './workspace';
import ModeSelectModal from './modeSelectModal';
import StudentLoginModal from './StudentLoginModal';
import './index.scss';
import { IStoreState } from '../store/modules';
import { IMapStateToProps } from '../store';

const Script = ({ children }: { children: any }) => (
    <script dangerouslySetInnerHTML={{ __html: `(${children.toString()})();` }}/>
);

// Returns true if running in web browser (not Electron IPC)
const isWebEnvironment = () => {
    return !(window as any).ipcInvoke || (window as any).ipcInvoke.isMock === true;
};

interface IProps extends IReduxState {

}

const IndexComponent: React.FC<IProps> = (props) => {
    const { mode } = props;

    // Web login state: check sessionStorage on first render
    const [studentCode, setStudentCode] = useState<string | null>(() => {
        if (isWebEnvironment()) {
            return sessionStorage.getItem('student_code');
        }
        return 'electron_skip'; // Electron: skip login
    });

    const handleLoginSuccess = (code: string, nickname: string, classroomName: string) => {
        setStudentCode(code);
    };

    // Web environment and no student login yet → show login modal
    if (!studentCode) {
        return <StudentLoginModal onLoginSuccess={handleLoginSuccess} />;
    }

    return (
        <div>
            {mode ? (
                <div className={`ws ${mode === 'workspace' ? '' : 'practical_course_mode'}`}>
                    <Workspace/>
                </div>
            ) : (
                <ModeSelectModal/>
            )}
            <Script>
                {/* eslint-disable id-length, no-undef, no-param-reassign */
                    () => {
                        // @ts-ignore
                        const playFunc = createjs.Sound.play;

                        // @ts-ignore
                        createjs.Sound.play = function(a: any, b: any) {
                            if (b) {
                                b.pan = 0.01;
                            } else {
                                b = { pan: 0.01 };
                            }
                            return playFunc(a, b);
                        };
                    }
                }
            </Script>
        </div>
    );
};


interface IReduxState {
    mode?: string;
}

const mapStateToProps: IMapStateToProps<IReduxState> = (state: IStoreState) => ({
    mode: state.persist.mode,
});

export default connect(mapStateToProps)(IndexComponent);
