import React from 'react';
import {withOnyx} from 'react-native-onyx';
import PropTypes from 'prop-types';
import {View} from 'react-native';
import lodashGet from 'lodash/get';
import _ from 'underscore';
import {PortalHost} from '@gorhom/portal';
import styles from '../../styles/styles';
import ScreenWrapper from '../../components/ScreenWrapper';
import HeaderView from './HeaderView';
import Navigation from '../../libs/Navigation/Navigation';
import ROUTES from '../../ROUTES';
import * as Report from '../../libs/actions/Report';
import ONYXKEYS from '../../ONYXKEYS';
import * as ReportUtils from '../../libs/ReportUtils';
import ReportActionsView from './report/ReportActionsView';
import CONST from '../../CONST';
import ReportActionsSkeletonView from '../../components/ReportActionsSkeletonView';
import reportActionPropTypes from './report/reportActionPropTypes';
import {withNetwork} from '../../components/OnyxProvider';
import compose from '../../libs/compose';
import Visibility from '../../libs/Visibility';
import networkPropTypes from '../../components/networkPropTypes';
import withWindowDimensions, {windowDimensionsPropTypes} from '../../components/withWindowDimensions';
import OfflineWithFeedback from '../../components/OfflineWithFeedback';
import ReportFooter from './report/ReportFooter';
import Banner from '../../components/Banner';
import withLocalize from '../../components/withLocalize';
import reportPropTypes from '../reportPropTypes';
import FullPageNotFoundView from '../../components/BlockingViews/FullPageNotFoundView';
import withViewportOffsetTop, {viewportOffsetTopPropTypes} from '../../components/withViewportOffsetTop';
import * as ReportActionsUtils from '../../libs/ReportActionsUtils';
import personalDetailsPropType from '../personalDetailsPropType';
import withNavigationFocus from '../../components/withNavigationFocus';
import getIsReportFullyVisible from '../../libs/getIsReportFullyVisible';
import EmojiPicker from '../../components/EmojiPicker/EmojiPicker';
import * as EmojiPickerAction from '../../libs/actions/EmojiPickerAction';
import TaskHeader from '../../components/TaskHeader';
import MoneyRequestHeader from '../../components/MoneyRequestHeader';
import withNavigation, {withNavigationPropTypes} from '../../components/withNavigation';
import * as ComposerActions from '../../libs/actions/Composer';
import ReportScreenContext from './ReportScreenContext';

const propTypes = {
    /** Navigation route context info provided by react navigation */
    route: PropTypes.shape({
        /** Route specific parameters used on this screen */
        params: PropTypes.shape({
            /** The ID of the report this screen should display */
            reportID: PropTypes.string,
        }).isRequired,
    }).isRequired,

    /** Tells us if the sidebar has rendered */
    isSidebarLoaded: PropTypes.bool,

    /** The report currently being looked at */
    report: reportPropTypes,

    /** Array of report actions for this report */
    reportActions: PropTypes.arrayOf(PropTypes.shape(reportActionPropTypes)),

    /** Whether the composer is full size */
    isComposerFullSize: PropTypes.bool,

    /** Beta features list */
    betas: PropTypes.arrayOf(PropTypes.string),

    /** The policies which the user has access to */
    policies: PropTypes.objectOf(
        PropTypes.shape({
            /** The policy name */
            name: PropTypes.string,

            /** The type of the policy */
            type: PropTypes.string,
        }),
    ),

    /** Information about the network */
    network: networkPropTypes.isRequired,

    /** The account manager report ID */
    accountManagerReportID: PropTypes.string,

    /** All of the personal details for everyone */
    personalDetails: PropTypes.objectOf(personalDetailsPropType),

    ...windowDimensionsPropTypes,
    ...viewportOffsetTopPropTypes,
    ...withNavigationPropTypes,
};

const defaultProps = {
    isSidebarLoaded: false,
    reportActions: {},
    report: {
        hasOutstandingIOU: false,
        isLoadingReportActions: false,
    },
    isComposerFullSize: false,
    betas: [],
    policies: {},
    accountManagerReportID: null,
    personalDetails: {},
};

/**
 * Get the currently viewed report ID as number
 *
 * @param {Object} route
 * @param {Object} route.params
 * @param {String} route.params.reportID
 * @returns {String}
 */
function getReportID(route) {
    return route.params.reportID.toString();
}

// Keep a reference to the list view height so we can use it when a new ReportScreen component mounts
let reportActionsListViewHeight = 0;

class ReportScreen extends React.Component {
    gestureStartListener = null;

    constructor(props) {
        super(props);

        this.onSubmitComment = this.onSubmitComment.bind(this);
        this.chatWithAccountManager = this.chatWithAccountManager.bind(this);
        this.dismissBanner = this.dismissBanner.bind(this);

        this.state = {
            skeletonViewContainerHeight: reportActionsListViewHeight,
            isBannerVisible: true,
        };
        this.firstRenderRef = React.createRef();
        this.flatListRef = React.createRef();
        this.reactionListRef = React.createRef();
    }

    componentDidMount() {
        this.unsubscribeVisibilityListener = Visibility.onVisibilityChange(() => {
            // If the report is not fully visible (AKA on small screen devices and LHR is open) or the report is optimistic (AKA not yet created)
            // we don't need to call openReport
            if (!getIsReportFullyVisible(this.props.isFocused) || this.props.report.isOptimisticReport) {
                return;
            }

            Report.openReport(this.props.report.reportID);
        });

        this.fetchReportIfNeeded();
        ComposerActions.setShouldShowComposeInput(true);
    }

    componentDidUpdate(prevProps) {
        // If composer should be hidden, hide emoji picker as well
        if (ReportUtils.shouldHideComposer(this.props.report, this.props.errors)) {
            EmojiPickerAction.hideEmojiPicker(true);
        }
        // If you already have a report open and are deeplinking to a new report on native,
        // the ReportScreen never actually unmounts and the reportID in the route also doesn't change.
        // Therefore, we need to compare if the existing reportID is the same as the one in the route
        // before deciding that we shouldn't call OpenReport.
        const onyxReportID = this.props.report.reportID;
        const routeReportID = getReportID(this.props.route);
        if (onyxReportID === prevProps.report.reportID && (!onyxReportID || onyxReportID === routeReportID)) {
            return;
        }

        this.fetchReportIfNeeded();
        ComposerActions.setShouldShowComposeInput(true);
    }

    componentWillUnmount() {
        if (!this.unsubscribeVisibilityListener) {
            return;
        }
        this.unsubscribeVisibilityListener();
    }

    /**
     * @param {String} text
     */
    onSubmitComment(text) {
        Report.addComment(getReportID(this.props.route), text);
    }

    getNavigationKey() {
        const navigation = this.props.navigation.getState();
        return lodashGet(navigation.routes, [navigation.index, 'key']);
    }

    /**
     * When false the ReportActionsView will completely unmount and we will show a loader until it returns true.
     *
     * @returns {Boolean}
     */
    isReportReadyForDisplay() {
        const reportIDFromPath = getReportID(this.props.route);

        // This is necessary so that when we are retrieving the next report data from Onyx the ReportActionsView will remount completely
        const isTransitioning = this.props.report && this.props.report.reportID !== reportIDFromPath;
        return reportIDFromPath !== '' && this.props.report.reportID && !isTransitioning;
    }

    fetchReportIfNeeded() {
        const reportIDFromPath = getReportID(this.props.route);

        // Report ID will be empty when the reports collection is empty.
        // This could happen when we are loading the collection for the first time after logging in.
        if (!reportIDFromPath) {
            return;
        }

        // It possible that we may not have the report object yet in Onyx yet e.g. we navigated to a URL for an accessible report that
        // is not stored locally yet. If props.report.reportID exists, then the report has been stored locally and nothing more needs to be done.
        // If it doesn't exist, then we fetch the report from the API.
        if (this.props.report.reportID && this.props.report.reportID === getReportID(this.props.route)) {
            return;
        }

        Report.openReport(reportIDFromPath);
    }

    dismissBanner() {
        this.setState({isBannerVisible: false});
    }

    chatWithAccountManager() {
        Navigation.navigate(ROUTES.getReportRoute(this.props.accountManagerReportID));
    }

    render() {
        // We are either adding a workspace room, or we're creating a chat, it isn't possible for both of these to be pending, or to have errors for the same report at the same time, so
        // simply looking up the first truthy value for each case will get the relevant property if it's set.
        const reportID = getReportID(this.props.route);
        const addWorkspaceRoomOrChatPendingAction = lodashGet(this.props.report, 'pendingFields.addWorkspaceRoom') || lodashGet(this.props.report, 'pendingFields.createChat');
        const addWorkspaceRoomOrChatErrors = lodashGet(this.props.report, 'errorFields.addWorkspaceRoom') || lodashGet(this.props.report, 'errorFields.createChat');
        const screenWrapperStyle = [styles.appContent, styles.flex1, {marginTop: this.props.viewportOffsetTop}];

        // There are no reportActions at all to display and we are still in the process of loading the next set of actions.
        const isLoadingInitialReportActions = _.isEmpty(this.props.reportActions) && this.props.report.isLoadingReportActions;

        const shouldHideReport = !ReportUtils.canAccessReport(this.props.report, this.props.policies, this.props.betas);

        const isLoading = !reportID || !this.props.isSidebarLoaded || _.isEmpty(this.props.personalDetails) || !this.firstRenderRef.current;
        this.firstRenderRef.current = true;

        const parentReportAction = ReportActionsUtils.getParentReportAction(this.props.report);
        const isSingleTransactionView = ReportActionsUtils.isTransactionThread(parentReportAction);

        const policy = this.props.policies[`${ONYXKEYS.COLLECTION.POLICY}${this.props.report.policyID}`];

        return (
            <ReportScreenContext.Provider
                value={{
                    flatListRef: this.flatListRef,
                    reactionListRef: this.reactionListRef,
                }}
            >
                <ScreenWrapper
                    style={screenWrapperStyle}
                    shouldEnableKeyboardAvoidingView={this.props.isFocused}
                >
                    <FullPageNotFoundView
                        shouldShow={(!this.props.report.reportID && !this.props.report.isLoadingReportActions && !isLoading) || shouldHideReport}
                        subtitleKey="notFound.noAccess"
                        shouldShowCloseButton={false}
                        shouldShowBackButton={this.props.isSmallScreenWidth}
                        onBackButtonPress={Navigation.goBack}
                    >
                        <OfflineWithFeedback
                            pendingAction={addWorkspaceRoomOrChatPendingAction}
                            errors={addWorkspaceRoomOrChatErrors}
                            shouldShowErrorMessages={false}
                        >
                            {ReportUtils.isMoneyRequestReport(this.props.report) || isSingleTransactionView ? (
                                <MoneyRequestHeader
                                    report={this.props.report}
                                    policies={this.props.policies}
                                    personalDetails={this.props.personalDetails}
                                    isSingleTransactionView={isSingleTransactionView}
                                    parentReportAction={parentReportAction}
                                />
                            ) : (
                                <HeaderView
                                    reportID={reportID}
                                    onNavigationMenuButtonClicked={() => Navigation.goBack(ROUTES.HOME)}
                                    personalDetails={this.props.personalDetails}
                                    report={this.props.report}
                                />
                            )}

                            {ReportUtils.isTaskReport(this.props.report) && (
                                <TaskHeader
                                    report={this.props.report}
                                    personalDetails={this.props.personalDetails}
                                />
                            )}
                        </OfflineWithFeedback>
                        {Boolean(this.props.accountManagerReportID) && ReportUtils.isConciergeChatReport(this.props.report) && this.state.isBannerVisible && (
                            <Banner
                                containerStyles={[styles.mh4, styles.mt4, styles.p4, styles.bgDark]}
                                textStyles={[styles.colorReversed]}
                                text={this.props.translate('reportActionsView.chatWithAccountManager')}
                                onClose={this.dismissBanner}
                                onPress={this.chatWithAccountManager}
                                shouldShowCloseButton
                            />
                        )}
                        <View
                            nativeID={CONST.REPORT.DROP_NATIVE_ID + this.getNavigationKey()}
                            style={[styles.flex1, styles.justifyContentEnd, styles.overflowHidden]}
                            onLayout={(event) => {
                                const skeletonViewContainerHeight = event.nativeEvent.layout.height;

                                // The height can be 0 if the component unmounts - we are not interested in this value and want to know how much space it
                                // takes up so we can set the skeleton view container height.
                                if (skeletonViewContainerHeight === 0) {
                                    return;
                                }
                                reportActionsListViewHeight = skeletonViewContainerHeight;
                                this.setState({skeletonViewContainerHeight});
                            }}
                        >
                            {this.isReportReadyForDisplay() && !isLoadingInitialReportActions && !isLoading && (
                                <ReportActionsView
                                    reportActions={this.props.reportActions}
                                    report={this.props.report}
                                    isComposerFullSize={this.props.isComposerFullSize}
                                    parentViewHeight={this.state.skeletonViewContainerHeight}
                                    policy={policy}
                                />
                            )}

                            {/* Note: The report should be allowed to mount even if the initial report actions are not loaded. If we prevent rendering the report while they are loading then
                            we'll unnecessarily unmount the ReportActionsView which will clear the new marker lines initial state. */}
                            {(!this.isReportReadyForDisplay() || isLoadingInitialReportActions || isLoading) && (
                                <ReportActionsSkeletonView containerHeight={this.state.skeletonViewContainerHeight} />
                            )}

                            {this.isReportReadyForDisplay() && (
                                <>
                                    <ReportFooter
                                        errors={addWorkspaceRoomOrChatErrors}
                                        pendingAction={addWorkspaceRoomOrChatPendingAction}
                                        isOffline={this.props.network.isOffline}
                                        reportActions={this.props.reportActions}
                                        report={this.props.report}
                                        isComposerFullSize={this.props.isComposerFullSize}
                                        onSubmitComment={this.onSubmitComment}
                                        policies={this.props.policies}
                                    />
                                </>
                            )}

                            {!this.isReportReadyForDisplay() && (
                                <ReportFooter
                                    shouldDisableCompose
                                    isOffline={this.props.network.isOffline}
                                />
                            )}

                            <EmojiPicker ref={EmojiPickerAction.emojiPickerRef} />
                            <PortalHost name={CONST.REPORT.DROP_HOST_NAME} />
                        </View>
                    </FullPageNotFoundView>
                </ScreenWrapper>
            </ReportScreenContext.Provider>
        );
    }
}

ReportScreen.propTypes = propTypes;
ReportScreen.defaultProps = defaultProps;

export default compose(
    withViewportOffsetTop,
    withLocalize,
    withWindowDimensions,
    withNavigationFocus,
    withNavigation,
    withNetwork(),
    withOnyx({
        isSidebarLoaded: {
            key: ONYXKEYS.IS_SIDEBAR_LOADED,
        },
        reportActions: {
            key: ({route}) => `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${getReportID(route)}`,
            canEvict: false,
            selector: ReportActionsUtils.getSortedReportActionsForDisplay,
        },
        report: {
            key: ({route}) => `${ONYXKEYS.COLLECTION.REPORT}${getReportID(route)}`,
        },
        isComposerFullSize: {
            key: ({route}) => `${ONYXKEYS.COLLECTION.REPORT_IS_COMPOSER_FULL_SIZE}${getReportID(route)}`,
        },
        betas: {
            key: ONYXKEYS.BETAS,
        },
        policies: {
            key: ONYXKEYS.COLLECTION.POLICY,
        },
        accountManagerReportID: {
            key: ONYXKEYS.ACCOUNT_MANAGER_REPORT_ID,
        },
        personalDetails: {
            key: ONYXKEYS.PERSONAL_DETAILS_LIST,
        },
    }),
)(ReportScreen);
