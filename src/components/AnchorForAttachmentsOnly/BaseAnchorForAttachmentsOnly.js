import React from 'react';
import {Pressable} from 'react-native';
import {withOnyx} from 'react-native-onyx';
import PropTypes from 'prop-types';
import {
    propTypes as anchorForAttachmentsOnlyPropTypes,
    defaultProps as anchorForAttachmentsOnlyDefaultProps,
} from './anchorForAttachmentsOnlyPropTypes';
import ONYXKEYS from '../../ONYXKEYS';
import AttachmentView from '../AttachmentView';
import * as Download from '../../libs/actions/Download';
import fileDownload from '../../libs/fileDownload';
import addEncryptedAuthTokenToURL from '../../libs/addEncryptedAuthTokenToURL';
import {ShowContextMenuContext, showContextMenuForReport} from '../ShowContextMenuContext';

const propTypes = {
    /** Press in handler for the link */
    onPressIn: PropTypes.func,

    /** Press out handler for the link */
    onPressOut: PropTypes.func,

    ...anchorForAttachmentsOnlyPropTypes,
};

const defaultProps = {
    onPressIn: undefined,
    onPressOut: undefined,
    ...anchorForAttachmentsOnlyDefaultProps,
};

class BaseAnchorForAttachmentsOnly extends React.Component {
    render() {
        const sourceURL = this.props.source;
        const sourceURLWithAuth = addEncryptedAuthTokenToURL(sourceURL);
        const sourceID = (sourceURL.match(/chat-attachments\/(\d+)/) || [])[1];
        const fileName = this.props.displayName;

        const isDownloading = this.props.download && this.props.download.isDownloading;

        return (
            <ShowContextMenuContext.Consumer>
                {({
                    anchor,
                    reportID,
                    action,
                    checkIfContextMenuActive,
                }) => (
                    <Pressable
                        style={this.props.style}
                        onPress={() => {
                            if (isDownloading) {
                                return;
                            }
                            Download.setDownload(sourceID, true);
                            fileDownload(sourceURLWithAuth, fileName).then(() => Download.setDownload(sourceID, false));
                        }}
                        onPressIn={this.props.onPressIn}
                        onPressOut={this.props.onPressOut}
                        onLongPress={event => showContextMenuForReport(
                            event,
                            anchor,
                            reportID,
                            action,
                            checkIfContextMenuActive,
                        )}
                    >
                        <AttachmentView
                            sourceURL={sourceURLWithAuth}
                            file={{name: fileName}}
                            shouldShowDownloadIcon
                            shouldShowLoadingSpinnerIcon={isDownloading}
                        />
                    </Pressable>
                )}
            </ShowContextMenuContext.Consumer>
        );
    }
}

BaseAnchorForAttachmentsOnly.propTypes = propTypes;
BaseAnchorForAttachmentsOnly.defaultProps = defaultProps;

export default withOnyx({
    download: {
        key: ({source}) => {
            const sourceID = (source.match(/chat-attachments\/(\d+)/) || [])[1];
            return `${ONYXKEYS.COLLECTION.DOWNLOAD}${sourceID}`;
        },
    },
})(BaseAnchorForAttachmentsOnly);
